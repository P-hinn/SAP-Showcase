import cds from '@sap/cds';

import * as policy from './lib/approval-policy';
import type * as risk from './lib/risk-scoring';
import * as s4 from './lib/s4-mapping';
import { EVENT, keyOf, today, type EventType, type RequisitionRow } from './service-helpers';

/**
 * The outbound half of the service: everything that talks to S/4HANA.
 *
 * Kept out of the service implementation so the file that holds the approval
 * lifecycle stays readable. These are plain functions over the handful of
 * things they need from the service, which also makes them easy to follow:
 * what an S/4HANA call may touch is the `S4Deps` interface, nothing else.
 *
 * The mapping itself (what becomes a purchase order, what a sync changes) is
 * in `lib/s4-mapping.ts` and has no idea a database exists.
 */
export interface S4Deps {
  entities: Record<string, any>;
  loadRequisition(id: string | undefined, req: cds.Request): Promise<RequisitionRow | null>;
  readActive(id: string | undefined): Promise<RequisitionRow | undefined>;
  logEvent(
    req: cds.Request,
    requisitionId: string | undefined,
    eventType: EventType,
    details?: { approvalLevel?: number; note?: string | null }
  ): Promise<void>;
  assessSupplier(
    supplierId: string | undefined,
    req: cds.Request
  ): Promise<{ assessment: risk.RiskAssessment; adjustedRequisitions: number } | null>;
}

/**
 * Converts an approved requisition into purchase orders in S/4HANA and
 * closes it. One purchase order per supplier, because that is what a
 * purchase order is. The requisition only closes when every order was
 * created; the numbers are written back to header and items.
 */
export async function convertToPurchaseOrder(req: cds.Request, deps: S4Deps): Promise<unknown> {
  const { PurchaseRequisitions, PurchaseRequisitionItems } = deps.entities;
  const id = keyOf(req);
  const requisition = await deps.loadRequisition(id, req);
  if (!requisition) return;

  const target = policy.targetStatus('close', requisition.status_code);
  if (!target) {
    return req.error({
      code: policy.MSG.INVALID_TRANSITION,
      message: 'ACTION_NOT_ALLOWED',
      args: ['close', requisition.status_code ?? ''],
      status: 400
    });
  }

  const items: s4.OrderableItem[] = await SELECT.from(PurchaseRequisitionItems)
    .where({ requisition_ID: id })
    .orderBy('itemNumber')
    .columns((item: any) => {
      item('*');
      /* eslint-disable @typescript-eslint/no-unused-expressions */
      item.material((material: any) => {
        material.materialNumber;
      });
      item.plant((plant: any) => {
        plant.plantCode;
      });
      item.supplier((supplier: any) => {
        supplier.supplierNumber;
      });
      /* eslint-enable @typescript-eslint/no-unused-expressions */
    });

  const orders = s4.purchaseOrdersFor(
    { requisitionNumber: requisition.requisitionNumber, requester: requisition.requester, currency: requisition.currency_code },
    items,
    today(req)
  );

  const created: string[] = [];
  try {
    const api = await cds.connect.to('API_PURCHASEORDER_PROCESS_SRV');
    for (const order of orders) {
      const result = (await api.run(
        INSERT.into('API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrder').entries(order.payload)
      )) as { PurchaseOrder?: string } | Array<{ PurchaseOrder?: string }>;
      const number = (Array.isArray(result) ? result[0] : result)?.PurchaseOrder ?? order.payload.PurchaseOrder;
      if (!number) throw new Error('S/4HANA did not return a purchase order number');
      created.push(String(number));
      await Promise.all(
        order.itemIds.map((itemId, index) =>
          UPDATE(PurchaseRequisitionItems, itemId).with({
            purchaseOrderNumber: String(number),
            purchaseOrderItem: s4.itemNumber(index)
          })
        )
      );
    }
  } catch (error) {
    return req.error({
      code: 'PR406',
      message: 'S4_PURCHASE_ORDER_FAILED',
      args: [(error as Error).message],
      status: 502
    });
  }

  await UPDATE(PurchaseRequisitions, id).with({
    status_code: target,
    purchaseOrderNumbers: created.join(', ')
  });
  await deps.logEvent(req, id, EVENT.ORDERED, { note: created.join(', ') });
  req.info({ message: 'S4_PURCHASE_ORDER_CREATED', args: [created.join(', ')] });
  return deps.readActive(id);
}

/** Takes over a new rating from the rating agency feed. */
export async function updateFinancialRating(req: cds.Request, deps: S4Deps): Promise<unknown> {
  const { Suppliers, FinancialRatings } = deps.entities;
  const id = keyOf(req);
  const { rating } = req.data as { rating?: string };

  const known = rating ? await SELECT.one.from(FinancialRatings).where({ code: rating }) : null;
  if (!known) {
    return req.error({ code: 'PR407', message: 'UNKNOWN_RATING', args: [rating ?? ''], status: 400, target: 'rating' });
  }

  const exists = await SELECT.one.from(Suppliers).columns('ID').where({ ID: id });
  if (!exists) {
    return req.error({ code: 'PR405', message: 'SUPPLIER_NOT_FOUND', args: [id ?? ''], status: 404 });
  }

  await UPDATE(Suppliers, id).with({ financialRating_code: rating });
  const result = await deps.assessSupplier(id, req);
  if (result) {
    req.info({
      message: 'RISK_REASSESSED',
      args: [result.assessment.score, result.assessment.riskClass, result.adjustedRequisitions]
    });
  }
  return SELECT.one.from(Suppliers).where({ ID: id });
}

/**
 * Reads suppliers and their addresses from the S/4HANA Business Partner API
 * and takes over what S/4HANA owns: name, country and purchasing block.
 * Everything the risk score needs beyond that (rating, delivery
 * performance, incidents) is owned by this application.
 */
export async function syncSuppliersFromS4(req: cds.Request, deps: S4Deps): Promise<unknown> {
  const { Suppliers, Countries } = deps.entities;

  let remote: s4.RemoteSupplier[];
  try {
    const api = await cds.connect.to('API_BUSINESS_PARTNER');
    const [suppliers, addresses] = await Promise.all([
      api.run(
        SELECT.from('API_BUSINESS_PARTNER.A_Supplier').columns(
          'Supplier',
          'SupplierName',
          'PurchasingIsBlocked'
        )
      ) as Promise<s4.A_Supplier[]>,
      api.run(
        SELECT.from('API_BUSINESS_PARTNER.A_BusinessPartnerAddress').columns('BusinessPartner', 'Country')
      ) as Promise<s4.A_BusinessPartnerAddress[]>
    ]);
    remote = s4.toRemoteSuppliers(suppliers, addresses);
  } catch (error) {
    return req.error({
      code: 'PR408',
      message: 'S4_SUPPLIER_SYNC_FAILED',
      args: [(error as Error).message],
      status: 502
    });
  }

  const local: Array<s4.LocalSupplier & { ID: string }> = await SELECT.from(Suppliers).columns(
    'ID',
    'supplierNumber',
    'name',
    'country_code',
    'isBlocked'
  );
  const countries = new Set(
    ((await SELECT.from(Countries).columns('code')) as Array<{ code: string }>).map((row) => row.code)
  );

  const plan = s4.planSupplierSync(remote, local, countries);
  const touched: string[] = [];

  for (const entry of plan.create) {
    const ID = cds.utils.uuid();
    await INSERT.into(Suppliers).entries({ ID, ...entry, s4SyncedAt: req.timestamp });
    touched.push(ID);
  }
  for (const entry of plan.update) {
    await UPDATE(Suppliers, entry.ID).with({ ...entry.changes, s4SyncedAt: req.timestamp });
    touched.push(entry.ID);
  }
  if (plan.unchanged.length) {
    await UPDATE(Suppliers).set({ s4SyncedAt: req.timestamp }).where({ ID: { in: plan.unchanged } });
  }

  let adjustedRequisitions = 0;
  for (const supplierId of touched) {
    const result = await deps.assessSupplier(supplierId, req);
    adjustedRequisitions += result?.adjustedRequisitions ?? 0;
  }

  req.info({
    message: 'S4_SUPPLIERS_SYNCED',
    args: [plan.create.length, plan.update.length, plan.unchanged.length, adjustedRequisitions]
  });
  return {
    created: plan.create.length,
    updated: plan.update.length,
    unchanged: plan.unchanged.length,
    adjustedRequisitions
  };
}
