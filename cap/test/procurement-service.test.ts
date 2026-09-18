import fs from 'node:fs';
import path from 'node:path';
import cds from '@sap/cds';
import ExcelJS from 'exceljs';

// --with-mocks serves the S/4HANA APIs (srv/external) in-process, exactly as
// `npm start` does, so the integration is tested without a remote system.
const { expect, GET, POST, PATCH, data } = cds.test(path.join(__dirname, '..'), '--with-mocks');

/** Users from the mocked auth configuration in package.json. */
const AS = {
  rita: { auth: { username: 'rita', password: '' } },   // Requester
  tom: { auth: { username: 'tom', password: '' } },     // Requester + ApproverL1
  dana: { auth: { username: 'dana', password: '' } },   // + ApproverL2
  carl: { auth: { username: 'carl', password: '' } },   // + ApproverL3, no Requester role
  mona: { auth: { username: 'mona', password: '' } }    // ProcurementAdmin + Requester
};

const PR = {
  draftSmall: 'd0000001-0000-4000-8000-000000000001',   // 4.800 EUR, risk A  -> L1
  inApproval: 'd0000002-0000-4000-8000-000000000002',   // 27.150 EUR, risk C -> L3, L1 done
  approved: 'd0000003-0000-4000-8000-000000000003',
  rejected: 'd0000004-0000-4000-8000-000000000004',
  overBudget: 'd0000007-0000-4000-8000-000000000007'    // 49.800 EUR against 25.000 EUR left
};

const SUPPLIER = {
  lowRisk: '50000001-0000-4000-8000-000000000001',      // Nordwind Stahl, class A
  highRisk: '50000006-0000-4000-8000-000000000006',     // Shenzhen Ruiyang, class C
  blocked: '50000008-0000-4000-8000-000000000008'       // Kontinental, purchasing block
};

/** In approval, 31.800 EUR from Anadolu (risk B) -> L2, L1 already signed. */
const PR_HYDRAULICS = 'd0000008-0000-4000-8000-000000000008';
const ANADOLU = '50000005-0000-4000-8000-000000000005';

const COST_CENTER = 'cc000001-0000-4000-8000-000000000001';
const MATERIAL = 'a0000001-0000-4000-8000-000000000001';

/**
 * Fully qualified entity names for the direct database access these tests use
 * to arrange state. CAP accepts the string form everywhere a definition is
 * expected, and unlike `cds.entities(...)[name]` it is not `possibly
 * undefined` - which keeps the arrange steps free of non-null assertions.
 */
const HEADERS = 'acme.procurement.PurchaseRequisitions';
const ITEMS = 'acme.procurement.PurchaseRequisitionItems';
const SUPPLIERS = 'acme.procurement.Suppliers';

const active = (id: string): string => `PurchaseRequisitions(ID=${id},IsActiveEntity=true)`;
const action = (id: string, name: string): string => `/procurement/${active(id)}/ProcurementService.${name}`;

/** An ISO date safely in the future, so the fixtures do not expire. */
function futureDate(days = 90): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/** Moves all delivery dates of a requisition into the future. */
async function makeDeliverable(requisitionId: string): Promise<void> {
  await UPDATE(ITEMS)
    .set({ deliveryDate: futureDate() })
    .where({ requisition_ID: requisitionId });
}

/** The error envelope OData returns: one error, or one with nested details. */
interface ODataError {
  response?: {
    status?: number;
    data?: { error?: { code?: string; details?: Array<{ code?: string }> } };
  };
}

/** Error codes of a failed OData request, flattened over single and multi errors. */
function errorCodes(error: ODataError): Array<string | undefined> {
  const payload = error.response?.data?.error;
  if (!payload) return [];                       // e.g. a bare 401 without a body
  return payload.details ? payload.details.map((detail) => detail.code) : [payload.code];
}

/** Runs a request that is expected to fail and returns its status and codes. */
async function expectFailure(
  request: Promise<unknown>
): Promise<{ status: number | undefined; codes: Array<string | undefined> }> {
  try {
    await request;
  } catch (error) {
    const odata = error as ODataError;
    return { status: odata.response?.status, codes: errorCodes(odata) };
  }
  throw new Error('Expected the request to fail, but it succeeded.');
}

// Wrapped rather than passed by reference: `data.reset` reads `this`, and
// handing the bare method to Jest would call it unbound.
beforeEach(() => data.reset());

describe('ProcurementService', () => {

  describe('reading', () => {
    it('serves the requisition list to any authenticated user', async () => {
      const { status, data: body } = await GET('/procurement/PurchaseRequisitions', AS.carl);
      expect(status).to.equal(200);
      expect(body.value.length).to.be.greaterThan(0);
    });

    it('rejects an anonymous request', async () => {
      const { status } = await expectFailure(GET('/procurement/PurchaseRequisitions'));
      expect(status).to.equal(401);
    });

    it('limits MyRequisitions to the requisitions of the calling user', async () => {
      const { data: body } = await GET('/procurement/MyRequisitions', AS.rita);
      expect(body.value.length).to.be.greaterThan(0);
      expect(body.value.every((row: { requester: string }) => row.requester === 'rita')).to.be.true;
    });

    it('lets a procurement admin see everything through MyRequisitions', async () => {
      const mine = await GET('/procurement/MyRequisitions', AS.mona);
      const all = await GET('/procurement/PurchaseRequisitions', AS.mona);
      expect(mine.data.value.length).to.equal(all.data.value.length);
    });

    it('calculates the risk criticality on read', async () => {
      const { data: body } = await GET(
        `/procurement/Suppliers?$filter=ID eq ${SUPPLIER.highRisk}&$select=riskClass_code,riskScoreCriticality`,
        AS.carl
      );
      expect(body.value[0].riskClass_code).to.equal('C');
      expect(body.value[0].riskScoreCriticality).to.equal(1); // red
    });
  });

  describe('submit', () => {
    it('assigns a number, sets the status and materialises the approval chain', async () => {
      await makeDeliverable(PR.draftSmall);

      const { status, data: body } = await POST(action(PR.draftSmall, 'submit'), {}, AS.rita);

      expect(status).to.equal(200);
      expect(body.status_code).to.equal('IA');
      expect(body.requisitionNumber).to.match(/^PR-\d{4}-\d{6}$/);
      expect(body.currentApprovalLevel).to.equal(0);
      expect(body.submittedAt).to.not.be.null;

      const { data: steps } = await GET(
        `/procurement/ApprovalSteps?$filter=requisition_ID eq ${PR.draftSmall}`, AS.rita
      );
      expect(steps.value).to.have.length(1);           // 4.800 EUR, risk class A
      expect(steps.value[0].level_code).to.equal(1);
      expect(steps.value[0].decision_code).to.equal('PEND');
    });

    it('keeps an already assigned number when a reworked requisition is resubmitted', async () => {
      await makeDeliverable(PR.rejected);
      await POST(action(PR.rejected, 'reopen'), {}, AS.tom);
      const { data: body } = await POST(action(PR.rejected, 'submit'), {}, AS.tom);
      expect(body.requisitionNumber).to.equal('PR-2026-000004');
    });

    it('refuses a requisition that exceeds the remaining cost center budget', async () => {
      await makeDeliverable(PR.overBudget);
      const { status, codes } = await expectFailure(POST(action(PR.overBudget, 'submit'), {}, AS.mona));
      expect(status).to.equal(400);
      expect(codes).to.include('PR006');
    });

    it('refuses a requisition with a blocked supplier', async () => {
      await makeDeliverable(PR.draftSmall);
      await UPDATE(ITEMS)
        .set({ supplier_ID: SUPPLIER.blocked })
        .where({ requisition_ID: PR.draftSmall });

      const { codes } = await expectFailure(POST(action(PR.draftSmall, 'submit'), {}, AS.rita));
      expect(codes).to.include('PR005');
    });

    it('refuses a delivery date in the past', async () => {
      await UPDATE(ITEMS)
        .set({ deliveryDate: '2020-01-01' })
        .where({ requisition_ID: PR.draftSmall });

      const { codes } = await expectFailure(POST(action(PR.draftSmall, 'submit'), {}, AS.rita));
      expect(codes).to.include('PR004');
    });

    it('reports every problem of a broken requisition at once', async () => {
      await UPDATE(ITEMS)
        .set({ deliveryDate: '2020-01-01', quantity: 0, supplier_ID: SUPPLIER.blocked })
        .where({ requisition_ID: PR.draftSmall });

      const { codes } = await expectFailure(POST(action(PR.draftSmall, 'submit'), {}, AS.rita));
      for (const code of ['PR002', 'PR004', 'PR005']) expect(codes).to.include(code);
    });

    it('refuses to submit a requisition that is already in approval', async () => {
      const { codes } = await expectFailure(POST(action(PR.inApproval, 'submit'), {}, AS.rita));
      expect(codes).to.include('PR009');
    });

    it('lets only the requester submit', async () => {
      await makeDeliverable(PR.draftSmall);
      const { status, codes } = await expectFailure(POST(action(PR.draftSmall, 'submit'), {}, AS.tom));
      expect(status).to.equal(403);
      expect(codes).to.include('PR403');
    });

    it('recalculates the approval level from the current item data', async () => {
      await makeDeliverable(PR.draftSmall);
      // 4.800 EUR at risk class A needs L1. Raising the price past 100.000 EUR
      // must push it to L3 without anyone touching the header.
      await UPDATE(ITEMS)
        .set({ unitPrice: 60, netAmount: 120000 })
        .where({ requisition_ID: PR.draftSmall });

      const { data: body } = await POST(action(PR.draftSmall, 'submit'), {}, AS.rita);
      expect(Number(body.totalValue)).to.equal(120000);
      expect(body.requiredApprovalLevel_code).to.equal(3);
    });
  });

  describe('approval', () => {
    it('walks the chain level by level and completes on the last one', async () => {
      const second = await POST(action(PR.inApproval, 'approve'), { comment: 'Budget checked.' }, AS.dana);
      expect(second.data.currentApprovalLevel).to.equal(2);
      expect(second.data.status_code).to.equal('IA');

      const third = await POST(action(PR.inApproval, 'approve'), { comment: 'Approved.' }, AS.carl);
      expect(third.data.currentApprovalLevel).to.equal(3);
      expect(third.data.status_code).to.equal('AP');
      expect(third.data.completedAt).to.not.be.null;
    });

    it('records who decided, when and why', async () => {
      await POST(action(PR.inApproval, 'approve'), { comment: 'Budget checked.' }, AS.dana);
      const { data: steps } = await GET(
        `/procurement/ApprovalSteps?$filter=requisition_ID eq ${PR.inApproval} and level_code eq 2`, AS.dana
      );
      expect(steps.value[0]).to.include({ decision_code: 'APPR', decidedBy: 'dana', comment: 'Budget checked.' });
      expect(steps.value[0].decidedAt).to.not.be.null;
    });

    it('blocks the requester from approving their own requisition', async () => {
      const { codes } = await expectFailure(POST(action(PR.inApproval, 'approve'), {}, AS.rita));
      expect(codes).to.include('PR008');
    });

    it('blocks an approver who lacks the role for the pending level', async () => {
      const { codes } = await expectFailure(POST(action(PR.inApproval, 'approve'), {}, AS.tom));
      expect(codes).to.include('PR010');
    });

    it('blocks an approval once the chain is complete', async () => {
      await POST(action(PR.inApproval, 'approve'), {}, AS.dana);
      await POST(action(PR.inApproval, 'approve'), {}, AS.carl);
      const { codes } = await expectFailure(POST(action(PR.inApproval, 'approve'), {}, AS.carl));
      expect(codes).to.include('PR009'); // no longer in approval
    });

    it('commits the approved value to the cost center budget', async () => {
      const before = await GET("/analytics/CostCenterBudget?$filter=costCenterCode eq '1000-4712'", AS.carl);
      await POST(action(PR.inApproval, 'approve'), {}, AS.dana);
      await POST(action(PR.inApproval, 'approve'), {}, AS.carl);
      const after = await GET("/analytics/CostCenterBudget?$filter=costCenterCode eq '1000-4712'", AS.carl);

      const consumed = (response: { data: { value: Array<{ consumedBudget: string }> } }): number =>
        Number(response.data.value[0]!.consumedBudget);
      expect(consumed(after) - consumed(before)).to.equal(27150);
    });

    it('does not touch the budget before the last signature', async () => {
      const before = await GET("/analytics/CostCenterBudget?$filter=costCenterCode eq '1000-4712'", AS.carl);
      await POST(action(PR.inApproval, 'approve'), {}, AS.dana);
      const after = await GET("/analytics/CostCenterBudget?$filter=costCenterCode eq '1000-4712'", AS.carl);
      expect(after.data.value[0].consumedBudget).to.equal(before.data.value[0].consumedBudget);
    });
  });

  describe('rejection', () => {
    it('sets the status, stores the reason and skips the open levels', async () => {
      const { data: body } = await POST(
        action(PR.inApproval, 'rejectRequisition'), { reason: 'Re-tender required.' }, AS.dana
      );
      expect(body.status_code).to.equal('RE');
      expect(body.rejectionReason).to.equal('Re-tender required.');

      const { data: steps } = await GET(
        `/procurement/ApprovalSteps?$filter=requisition_ID eq ${PR.inApproval}&$orderby=level_code`, AS.dana
      );
      expect(steps.value.map((step: { decision_code: string }) => step.decision_code)).to.eql(['APPR', 'REJE', 'SKIP']);
    });

    it('requires a reason', async () => {
      const { status } = await expectFailure(
        POST(action(PR.inApproval, 'rejectRequisition'), {}, AS.dana)
      );
      expect(status).to.equal(400);
    });

    it('lets the requester rework a rejected requisition', async () => {
      const { data: body } = await POST(action(PR.rejected, 'reopen'), {}, AS.tom);
      expect(body.status_code).to.equal('DR');
      expect(body.rejectionReason).to.be.null;
      expect(body.currentApprovalLevel).to.equal(0);

      const { data: steps } = await GET(
        `/procurement/ApprovalSteps?$filter=requisition_ID eq ${PR.rejected}`, AS.tom
      );
      expect(steps.value).to.have.length(0);
    });
  });

  describe('withdraw', () => {
    it('pulls an untouched requisition back into draft', async () => {
      await makeDeliverable(PR.draftSmall);
      await POST(action(PR.draftSmall, 'submit'), {}, AS.rita);

      const { data: body } = await POST(action(PR.draftSmall, 'withdraw'), {}, AS.rita);
      expect(body.status_code).to.equal('DR');
      expect(body.submittedAt).to.be.null;
    });

    it('refuses once an approver has already signed off', async () => {
      const { codes } = await expectFailure(POST(action(PR.inApproval, 'withdraw'), {}, AS.rita));
      expect(codes).to.include('PR009');
    });
  });

  describe('close', () => {
    it('closes an approved requisition', async () => {
      const { data: body } = await POST(action(PR.approved, 'close'), {}, AS.mona);
      expect(body.status_code).to.equal('CL');
    });

    it('refuses to close a requisition that is not approved', async () => {
      const { codes } = await expectFailure(POST(action(PR.draftSmall, 'close'), {}, AS.mona));
      expect(codes).to.include('PR009');
    });
  });

  describe('supplier risk', () => {
    it('recalculates a single supplier after a master data change', async () => {
      await UPDATE(SUPPLIERS)
        .set({ financialRating_code: 'D', onTimeDeliveryRate: 0.3, qualityIncidents12M: 12, isoCertified: false })
        .where({ ID: SUPPLIER.lowRisk });

      const { data: body } = await POST(
        `/procurement/Suppliers(${SUPPLIER.lowRisk})/ProcurementService.recalculateRisk`, {}, AS.mona
      );
      // 0.40*100 + 0.25*70 + 0.20*100 + 0.10*5 + 0.05*100 = 83
      expect(body.riskScore).to.equal(83);
      expect(body.riskClass_code).to.equal('C');
      expect(body.riskCalculatedAt).to.not.be.null;
    });

    it('reports how many suppliers changed in the bulk run', async () => {
      await UPDATE(SUPPLIERS).set({ riskScore: 0, riskClass_code: 'A' }).where({ ID: SUPPLIER.highRisk });

      const { data: body } = await POST('/procurement/recalculateAllSupplierRisks', {}, AS.mona);
      expect(body.evaluated).to.equal(8);
      expect(body.changed).to.equal(1);
    });

    it('lets only a procurement admin run the bulk recalculation', async () => {
      const { status } = await expectFailure(POST('/procurement/recalculateAllSupplierRisks', {}, AS.rita));
      expect(status).to.equal(403);
    });

    it('lets only a procurement admin change supplier master data', async () => {
      const { status } = await expectFailure(
        PATCH(`/procurement/Suppliers(${SUPPLIER.lowRisk})`, { isBlocked: true }, AS.rita)
      );
      expect(status).to.equal(403);
    });
  });

  describe('determinations', () => {
    it('numbers items, prices them and derives the header from the items', async () => {
      const id = 'aaaaaaaa-0000-4000-8000-00000000000a';

      await INSERT.into(HEADERS).entries({
        ID: id, title: 'Determination test', requester: 'rita',
        costCenter_ID: COST_CENTER, currency_code: 'EUR', status_code: 'DR'
      });
      await INSERT.into(ITEMS).entries([
        { requisition_ID: id, material_ID: MATERIAL, description: 'A', quantity: 10, unitPrice: 2.5,
          supplier_ID: SUPPLIER.highRisk, deliveryDate: futureDate() },
        { requisition_ID: id, material_ID: MATERIAL, description: 'B', quantity: 3.333, unitPrice: 1.11,
          supplier_ID: SUPPLIER.lowRisk, deliveryDate: futureDate() }
      ]);

      const { data: body } = await POST(action(id, 'submit'), {}, AS.rita);

      // 10 * 2.50 = 25.00 plus 3.333 * 1.11 = 3.69963, rounded once to 3.70
      expect(Number(body.totalValue)).to.equal(28.70);
      // The worst supplier in the document decides the risk class.
      expect(body.supplierRiskClass_code).to.equal('C');
      // Below 5.000 EUR at risk class C the matrix demands two levels.
      expect(body.requiredApprovalLevel_code).to.equal(2);

      const { data: items } = await GET(
        `/procurement/PurchaseRequisitionItems?$filter=requisition_ID eq ${id}&$orderby=itemNumber`, AS.rita
      );
      expect(items.value.map((item: { itemNumber: number }) => item.itemNumber)).to.eql([10, 20]);
      expect(items.value.map((item: { netAmount: string }) => Number(item.netAmount))).to.eql([25, 3.7]);
    });

  });

  /**
   * The full Fiori draft round trip: create a draft, add an item to it, let the
   * determinations run and activate. A draft enabled entity can only be
   * modified through its root, which is exactly what a Fiori Elements object
   * page does.
   */
  describe('draft handling', () => {
    const drafts = '/procurement/PurchaseRequisitions';
    const draft = (id: string): string => `${drafts}(ID=${id},IsActiveEntity=false)`;

    it('walks create -> add item -> activate and derives everything on the way', async () => {
      const { status, data: header } = await POST(drafts, {
        title: 'Draft round trip',
        requester: 'rita',
        costCenter_ID: COST_CENTER,
        currency_code: 'EUR'
      }, AS.rita);

      expect(status).to.equal(201);
      expect(header.IsActiveEntity).to.be.false;

      // The material master defaults description, unit and price.
      const { data: item } = await POST(`${draft(header.ID)}/items`, {
        material_ID: MATERIAL,
        quantity: 100,
        supplier_ID: SUPPLIER.lowRisk,
        deliveryDate: futureDate()
      }, AS.rita);

      expect(item.description).to.equal('Steel plate S235JR 10mm');
      expect(item.unit).to.equal('KG');
      expect(Number(item.unitPrice)).to.equal(2.4);
      expect(Number(item.netAmount)).to.equal(240);

      // Activating runs the header determination over the whole draft tree.
      const { data: activated } = await POST(
        `${draft(header.ID)}/ProcurementService.draftActivate`, {}, AS.rita
      );
      expect(activated.IsActiveEntity).to.be.true;
      expect(Number(activated.totalValue)).to.equal(240);
      expect(activated.supplierRiskClass_code).to.equal('A');
      expect(activated.requiredApprovalLevel_code).to.equal(1);
      expect(activated.status_code).to.equal('DR');

      // ... and the activated requisition can be submitted right away.
      const { data: submitted } = await POST(action(header.ID, 'submit'), {}, AS.rita);
      expect(submitted.status_code).to.equal('IA');
    });

    it('recalculates the approval path when an item is changed in the draft', async () => {
      const { data: header } = await POST(drafts, {
        title: 'Escalating draft', requester: 'rita', costCenter_ID: COST_CENTER, currency_code: 'EUR'
      }, AS.rita);

      await POST(`${draft(header.ID)}/items`, {
        material_ID: MATERIAL, quantity: 100, unitPrice: 10,
        supplier_ID: SUPPLIER.lowRisk, deliveryDate: futureDate()
      }, AS.rita);

      let activated = (await POST(`${draft(header.ID)}/ProcurementService.draftActivate`, {}, AS.rita)).data;
      expect(activated.requiredApprovalLevel_code).to.equal(1);   // 1.000 EUR, risk A

      // Edit again: same quantity, far higher price -> a different approval path.
      await POST(`/procurement/${active(header.ID)}/ProcurementService.draftEdit`,
        { PreserveChanges: true }, AS.rita);
      const { data: items } = await GET(`${draft(header.ID)}/items`, AS.rita);
      await PATCH(
        `/procurement/PurchaseRequisitionItems(ID=${items.value[0].ID},IsActiveEntity=false)`,
        { unitPrice: 2000 }, AS.rita
      );
      activated = (await POST(`${draft(header.ID)}/ProcurementService.draftActivate`, {}, AS.rita)).data;

      expect(Number(activated.totalValue)).to.equal(200000);
      expect(activated.requiredApprovalLevel_code).to.equal(3);   // 200.000 EUR -> CFO
    });
  });

  describe('analytics', () => {
    it('aggregates the requested volume per material group in the database', async () => {
      const { status, data: body } = await GET('/analytics/SpendByMaterialGroup', AS.carl);
      expect(status).to.equal(200);
      const itHardware = body.value.filter((row: { materialGroupCode: string }) => row.materialGroupCode === 'MG-ITHW');
      expect(itHardware.length).to.be.greaterThan(0);
      expect(itHardware.every((row: { requestedVolume: string }) => Number(row.requestedVolume) > 0)).to.be.true;
    });

    it('shows the open exposure only for suppliers with running demand', async () => {
      const { data: body } = await GET('/analytics/SupplierRiskExposure', AS.carl);
      expect(body.value.length).to.be.greaterThan(0);
      expect(body.value.every((row: { openVolume: string }) => Number(row.openVolume) > 0)).to.be.true;
      const highRisk = body.value.find((row: { riskClass: string }) => row.riskClass === 'C');
      expect(highRisk).to.exist;
    });

    it('derives the remaining budget per cost center', async () => {
      const { data: body } = await GET('/analytics/CostCenterBudget', AS.carl);
      for (const row of body.value as Array<{ annualBudget: string; consumedBudget: string; remainingBudget: string }>) {
        expect(Number(row.remainingBudget))
          .to.equal(Number(row.annualBudget) - Number(row.consumedBudget));
      }
    });
  });

  describe('languages and the current user', () => {
    const german = (as: { auth: { username: string; password: string } }) => ({
      ...as,
      headers: { 'Accept-Language': 'de' }
    });

    it('tells the UI shell who is calling and with which roles', async () => {
      const { data: body } = await GET('/procurement/currentUser()', AS.tom);
      expect(body.id).to.equal('tom');
      expect([...body.roles].sort()).to.deep.equal(['ApproverL1', 'Requester']);
    });

    it('answers with localized error messages but the same message code', async () => {
      const english = await POST(action(PR.inApproval, 'submit'), {}, AS.rita).catch((e: unknown) => e);
      const deutsch = await POST(action(PR.inApproval, 'submit'), {}, german(AS.rita)).catch((e: unknown) => e);
      const messageOf = (e: unknown) =>
        (e as { response: { data: { error: { code: string; message: string } } } }).response.data.error;

      expect(messageOf(english).code).to.equal('PR009');
      expect(messageOf(deutsch).code).to.equal('PR009');
      expect(messageOf(english).message).to.match(/^Only a requisition in status Draft/);
      expect(messageOf(deutsch).message).to.match(/^Nur Bestellanforderungen im Status Entwurf/);
    });

    it('localizes rule findings including their arguments', async () => {
      await UPDATE(ITEMS)
        .set({ deliveryDate: '2020-01-01' })
        .where({ requisition_ID: PR.draftSmall });

      const failure = await POST(action(PR.draftSmall, 'submit'), {}, german(AS.rita)).catch((e: unknown) => e);
      const { message } = (failure as { response: { data: { error: { message: string } } } }).response.data.error;
      expect(message).to.match(/^Position 10: Das Lieferdatum darf nicht in der Vergangenheit liegen\.$/);
    });

    it('serves code list texts and annotation labels in the request language', async () => {
      const { data: body } = await GET(
        `/procurement/PurchaseRequisitions?$filter=ID eq ${PR.inApproval}&$expand=status($select=name)`,
        german(AS.rita)
      );
      expect(body.value[0].status.name).to.equal('In Genehmigung');

      const { data: metadata } = await GET('/procurement/$metadata', german(AS.rita));
      expect(metadata).to.contain('String="Bestellanforderungen"');
    });

    it('has a German text for every server message, with the same placeholders', () => {
      const read = (file: string): Map<string, string> =>
        new Map(
          fs
            .readFileSync(path.join(__dirname, '..', '_i18n', file), 'utf8')
            .split('\n')
            .filter((line) => line.includes('=') && !line.startsWith('#'))
            .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)] as [string, string])
        );
      const placeholders = (text: string | undefined) => (text ?? '').match(/\{\d\}/g)?.sort() ?? [];
      const en = read('messages.properties');
      const de = read('messages_de.properties');

      expect([...de.keys()].sort()).to.deep.equal([...en.keys()].sort());
      for (const [key, text] of en) expect([key, ...placeholders(de.get(key))]).to.deep.equal([key, ...placeholders(text)]);
    });
  });

  describe('approver inbox', () => {
    const numbersFor = async (as: typeof AS.rita): Promise<string[]> => {
      const { data: body } = await GET('/procurement/MyApprovalTasks?$select=requisitionNumber', as);
      return body.value.map((row: { requisitionNumber: string }) => row.requisitionNumber).sort();
    };

    it('shows an approver exactly the requisitions waiting for a level they hold', async () => {
      expect(await numbersFor(AS.dana)).to.deep.equal(['PR-2026-000002', 'PR-2026-000006']);
      expect(await numbersFor(AS.carl)).to.deep.equal(['PR-2026-000002', 'PR-2026-000006']);
    });

    it('is empty for a requester and for an approver whose level is already done', async () => {
      expect(await numbersFor(AS.rita)).to.deep.equal([]);
      expect(await numbersFor(AS.tom)).to.deep.equal([]);
    });

    it('never shows an approver their own requisition', async () => {
      await UPDATE(HEADERS).set({ requester: 'dana', createdBy: 'dana' }).where({ ID: PR_HYDRAULICS });
      expect(await numbersFor(AS.dana)).to.deep.equal(['PR-2026-000002']);
    });

    it('lets the approver decide right from the inbox and records it in the audit trail', async () => {
      await POST(`/procurement/MyApprovalTasks(${PR_HYDRAULICS})/ProcurementService.approve`, { comment: 'ok' }, AS.dana);

      const { data: body } = await GET(
        `/procurement/${active(PR_HYDRAULICS)}?$select=status_code,currentApprovalLevel&$expand=events($select=eventType_code,actor,approvalLevel,note)`,
        AS.dana
      );
      expect(body.status_code).to.equal('AP');
      expect(body.currentApprovalLevel).to.equal(2);
      const last = body.events.find((event: { actor: string }) => event.actor === 'dana');
      expect(last).to.deep.include({ eventType_code: 'APPR', approvalLevel: 2, note: 'ok' });
    });
  });

  describe('audit trail', () => {
    it('writes one event per lifecycle step', async () => {
      await makeDeliverable(PR.draftSmall);
      await POST(action(PR.draftSmall, 'submit'), {}, AS.rita);
      await POST(action(PR.draftSmall, 'withdraw'), {}, AS.rita);

      const { data: body } = await GET(
        `/procurement/RequisitionEvents?$filter=requisition_ID eq ${PR.draftSmall}&$orderby=occurredAt&$select=eventType_code,actor`,
        AS.rita
      );
      expect(body.value.map((event: { eventType_code: string }) => event.eventType_code)).to.deep.equal(['SUBM', 'WDRW']);
    });
  });

  describe('supplier downgrade', () => {
    const downgrade = (as: typeof AS.mona, rating = 'CC') =>
      POST(`/procurement/Suppliers(${ANADOLU})/ProcurementService.updateFinancialRating`, { rating }, as);

    it('makes an open requisition stricter immediately: the missing level is appended', async () => {
      const { data: supplier } = await downgrade(AS.mona);
      expect(supplier.riskClass_code).to.equal('C');

      const { data: body } = await GET(
        `/procurement/${active(PR_HYDRAULICS)}?$expand=approvalSteps($select=level_code,decision_code),events($select=eventType_code,note)`,
        AS.mona
      );
      expect(body.supplierRiskClass_code).to.equal('C');
      expect(body.requiredApprovalLevel_code).to.equal(3);
      const steps = body.approvalSteps
        .map((step: { level_code: number; decision_code: string }) => `${step.level_code}:${step.decision_code}`)
        .sort();
      expect(steps).to.deep.equal(['1:APPR', '2:PEND', '3:PEND']);
      const path = body.events.find((event: { eventType_code: string }) => event.eventType_code === 'PATH');
      expect(path.note).to.equal('Anadolu Endustri A.S.: B -> C, L2 -> L3');
    });

    it('is reserved for the procurement admin', async () => {
      const { status } = await expectFailure(downgrade(AS.dana));
      expect(status).to.equal(403);
    });

    it('rejects a rating the rating table does not know', async () => {
      const { status, codes } = await expectFailure(downgrade(AS.mona, 'XYZ'));
      expect(status).to.equal(400);
      expect(codes).to.include('PR407');
    });
  });

  describe('S/4HANA integration', () => {
    it('creates one purchase order per supplier in S/4HANA and writes the numbers back', async () => {
      const { data: body } = await POST(action(PR.approved, 'close'), {}, AS.mona);
      expect(body.status_code).to.equal('CL');
      expect(body.purchaseOrderNumbers).to.match(/^45\d{8}$/);

      const s4 = await cds.connect.to('API_PURCHASEORDER_PROCESS_SRV');
      const order = await s4.run(
        SELECT.one.from('API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrder', (po: any) => {
          po('*');
          po.to_PurchaseOrderItem((item: any) => item('*'));
        }).where({ PurchaseOrder: body.purchaseOrderNumbers })
      );
      expect(order).to.deep.include({ Supplier: '4711004', CompanyCode: '1010', PurchaseOrderType: 'NB' });
      expect(order.to_PurchaseOrderItem).to.have.length(1);
      expect(order.to_PurchaseOrderItem[0]).to.deep.include({ PurchaseOrderItem: '00010', Material: '400000333', Plant: '1010' });

      const { data: items } = await GET(
        `/procurement/PurchaseRequisitionItems?$filter=requisition_ID eq ${PR.approved}&$select=purchaseOrderNumber,purchaseOrderItem`,
        AS.mona
      );
      expect(items.value[0]).to.deep.include({ purchaseOrderNumber: body.purchaseOrderNumbers, purchaseOrderItem: '00010' });
    });

    it('takes over suppliers from S/4HANA and adjusts open requisitions of a newly blocked one', async () => {
      const { data: result } = await POST('/procurement/syncSuppliersFromS4', {}, AS.mona);
      expect(result).to.deep.include({ created: 1, updated: 2, unchanged: 6, adjustedRequisitions: 1 });

      const { data: suppliers } = await GET(
        "/procurement/Suppliers?$filter=supplierNumber in ('4711004','4711007','4711009')&$orderby=supplierNumber&$select=name,isBlocked,country_code,riskClass_code,s4SyncedAt",
        AS.mona
      );
      const [wisla, bharat, nordic] = suppliers.value;
      expect(wisla).to.deep.include({ isBlocked: true, riskClass_code: 'C' });
      expect(bharat.name).to.equal('Bharat Polymers Pvt. Ltd.');
      expect(nordic).to.deep.include({ name: 'Nordic Castings AB', country_code: 'SE' });
      expect(nordic.s4SyncedAt).to.be.a('string');

      // The draft for 49.800 EUR used Wisla (A -> C): its path grows from L2 to L3.
      const { data: draft } = await GET(`/procurement/${active(PR.overBudget)}?$select=requiredApprovalLevel_code`, AS.mona);
      expect(draft.requiredApprovalLevel_code).to.equal(3);
    });

    it('changes nothing when run a second time', async () => {
      await POST('/procurement/syncSuppliersFromS4', {}, AS.mona);
      const { data: again } = await POST('/procurement/syncSuppliersFromS4', {}, AS.mona);
      expect(again).to.deep.include({ created: 0, updated: 0, unchanged: 9, adjustedRequisitions: 0 });
    });

    it('is reserved for the procurement admin', async () => {
      const { status } = await expectFailure(POST('/procurement/syncSuppliersFromS4', {}, AS.carl));
      expect(status).to.equal(403);
    });
  });

  describe('demo mode', () => {
    const asCookie = (id: string) => ({ headers: { Cookie: `acme-demo-user=${id}` } });

    it('switches the user with a cookie, even against cached basic credentials', async () => {
      const { data: body } = await GET('/procurement/currentUser()', { ...AS.rita, ...asCookie('carl') });
      expect(body.id).to.equal('carl');
    });

    it('ignores a cookie naming a user that is not a demo user', async () => {
      const { status } = await expectFailure(GET('/procurement/currentUser()', asCookie('alice')));
      expect(status).to.equal(401);
    });

    it('lists exactly the demo users of this app', async () => {
      const { data: body } = await GET('/demo/users()', AS.rita);
      expect(body.value.map((user: { id: string }) => user.id).sort()).to.deep.equal(['carl', 'dana', 'mona', 'rita', 'tom']);
    });

    it('restores the sample data', async () => {
      await POST('/procurement/syncSuppliersFromS4', {}, AS.mona);
      await POST('/demo/resetData', {}, AS.rita);
      const { data: body } = await GET('/procurement/Suppliers/$count', AS.rita);
      expect(Number(body)).to.equal(8);
    });
  });

  describe('approval matrix maintenance', () => {
    type Rows = Array<Array<string | number>>;
    const workbook = async (rows: Rows): Promise<string> => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Matrix');
      for (const row of rows) sheet.addRow(row);
      return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
    };
    const HEADER = ['Up to', 'A', 'B', 'C'];

    it('exports the matrix in force as a workbook that previews without findings', async () => {
      const { data: exported } = await GET('/procurement/exportApprovalMatrix()', AS.rita);
      const { data: preview } = await POST('/procurement/previewApprovalMatrix', { file: exported.value }, AS.mona);
      expect(preview.findings).to.deep.equal([]);
      expect(preview.tiers.map((tier: { levelC: number }) => tier.levelC)).to.deep.equal([2, 2, 3, 3]);
    });

    it('round-trips the German export too, whose last row says "und darüber"', async () => {
      const german = { ...AS.mona, headers: { 'Accept-Language': 'de' } };
      const { data: exported } = await GET('/procurement/exportApprovalMatrix()', german);
      const { data: preview } = await POST('/procurement/previewApprovalMatrix', { file: exported.value }, german);
      expect(preview.findings).to.deep.equal([]);
    });

    it('previews a broken matrix with localized findings and stores nothing', async () => {
      const file = await workbook([HEADER, [5000, 2, 1, 2], ['', 3, 3, 3]]);
      const { data: preview } = await POST('/procurement/previewApprovalMatrix', { file }, {
        ...AS.mona,
        headers: { 'Accept-Language': 'de' }
      });
      expect(preview.findings).to.have.length(1);
      expect(preview.findings[0]).to.deep.include({ code: 'PR425', row: 2 });
      expect(preview.findings[0].message).to.match(/^Ein riskanterer Lieferant/);

      const { data: stored } = await GET('/procurement/ApprovalThresholds?$orderby=position', AS.mona);
      expect(stored.value.map((row: { levelA: number }) => row.levelA)).to.deep.equal([1, 1, 2, 3]);
    });

    it('refuses to activate a matrix that has findings', async () => {
      const file = await workbook([HEADER, [5000, 1, 1, 1]]);
      const { status, codes } = await expectFailure(POST('/procurement/activateApprovalMatrix', { file }, AS.mona));
      expect(status).to.equal(400);
      expect(codes).to.include('PR424');
    });

    it('activates a valid matrix, which then decides new submissions', async () => {
      const file = await workbook([HEADER, ['', 3, 3, 3]]);
      const { data: result } = await POST('/procurement/activateApprovalMatrix', { file }, AS.mona);
      expect(result.value).to.equal(1);

      await makeDeliverable(PR.draftSmall);
      const { data: submitted } = await POST(action(PR.draftSmall, 'submit'), {}, AS.rita);
      expect(submitted.requiredApprovalLevel_code).to.equal(3);
    });

    it('keeps requisitions already in approval on the path they were submitted with', async () => {
      const file = await workbook([HEADER, ['', 3, 3, 3]]);
      await POST('/procurement/activateApprovalMatrix', { file }, AS.mona);
      const { data: body } = await GET(`/procurement/${active(PR_HYDRAULICS)}?$select=requiredApprovalLevel_code`, AS.mona);
      expect(body.requiredApprovalLevel_code).to.equal(2);
    });

    it('rejects a file that is not a workbook', async () => {
      const file = Buffer.from('not an excel file').toString('base64');
      const { codes } = await expectFailure(POST('/procurement/previewApprovalMatrix', { file }, AS.mona));
      expect(codes).to.include('PR427');
    });

    it('is reserved for the procurement admin', async () => {
      const file = await workbook([HEADER, ['', 3, 3, 3]]);
      const { status } = await expectFailure(POST('/procurement/activateApprovalMatrix', { file }, AS.carl));
      expect(status).to.equal(403);
    });
  });

  describe('notifications', () => {
    const inbox = async (as: typeof AS.rita): Promise<string[]> => {
      const { data: body } = await GET('/procurement/MyNotifications?$select=kind_code,requisitionNumber&$orderby=createdAt', as);
      return body.value.map((row: { kind_code: string; requisitionNumber: string }) => `${row.kind_code} ${row.requisitionNumber}`);
    };

    it('shows approvers the requests for their roles and requesters their outcomes', async () => {
      expect(await inbox(AS.dana)).to.deep.equal(['NEED PR-2026-000002', 'NEED PR-2026-000006']);
      expect(await inbox(AS.tom)).to.deep.equal(['REJE PR-2026-000004']);
      expect(await inbox(AS.rita)).to.deep.equal(['ORDR PR-2026-000005']);
    });

    it('asks level 1 on submit and never shows it to the requester', async () => {
      await makeDeliverable(PR.draftSmall);
      await POST(action(PR.draftSmall, 'submit'), {}, AS.rita);
      expect(await inbox(AS.tom)).to.include('NEED PR-2026-000001');
      expect(await inbox(AS.rita)).to.not.include('NEED PR-2026-000001');
    });

    it('does not ask an approver about a requisition they raised themselves', async () => {
      await UPDATE(HEADERS).set({ requester: 'dana', createdBy: 'dana' }).where({ ID: PR.draftSmall });
      await makeDeliverable(PR.draftSmall);
      await POST(action(PR.draftSmall, 'submit'), {}, AS.dana);
      expect(await inbox(AS.dana)).to.not.include('NEED PR-2026-000001');
      expect(await inbox(AS.tom)).to.include('NEED PR-2026-000001');
    });

    it('tells the requester when the last level approves', async () => {
      await POST(`/procurement/MyApprovalTasks(${PR_HYDRAULICS})/ProcurementService.approve`, { comment: 'ok' }, AS.dana);
      expect(await inbox(AS.rita)).to.include('APPR PR-2026-000006');
    });
  });
});
