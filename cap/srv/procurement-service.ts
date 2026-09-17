import cds from '@sap/cds';

import { lineAmount, sumAmounts, toMinorUnits, type Amount } from './lib/money';
import * as policy from './lib/approval-policy';
import type { ValidatableItem } from './lib/approval-policy';
import * as risk from './lib/risk-scoring';
import type { RiskClass } from './lib/risk-scoring';
import * as s4 from './s4-handlers';
import {
  EVENT,
  criticalityForRiskClass,
  decidableLevels,
  keyOf,
  knownRolesOf,
  raise,
  rolesOf,
  today,
  type EventType,
  type RequisitionRow
} from './service-helpers';

/**
 * Implementation of the transactional procurement service.
 *
 * The handlers here do plumbing only - read the data, call the rule modules in
 * srv/lib, write the result back. Every business decision lives in those
 * modules, which is what makes the rules testable without a database and
 * comparable line by line with the ABAP implementation.
 */

/** An item row enriched with the supplier attributes the rules need. */
interface EnrichedItem extends ValidatableItem {
  ID: string;
  supplier_ID?: string | null;
  /** What the database currently holds - used to skip no-op updates. */
  storedNetAmount?: Amount;
  storedItemNumber?: number | null;
  netAmount: number;
}

/** Everything `submit` needs after recomputing the document from its items. */
interface Recalculation {
  items: EnrichedItem[];
  totalValue: number;
  riskClass: RiskClass | null;
  requiredLevel: number;
}

interface CostCenterRow {
  ID: string;
  costCenterCode?: string | null;
  annualBudget?: Amount;
  consumedBudget?: Amount;
}

export default class ProcurementService extends cds.ApplicationService {
  /** Entity references, resolved once in init() and reused by every handler. */
  private entityRefs!: {
    PurchaseRequisitions: any;
    PurchaseRequisitionItems: any;
    ApprovalSteps: any;
    RequisitionEvents: any;
    Suppliers: any;
    CostCenters: any;
    FinancialRatings: any;
    Countries: any;
  };

  override async init(): Promise<void> {
    const {
      PurchaseRequisitions,
      PurchaseRequisitionItems,
      ApprovalSteps,
      RequisitionEvents,
      MyApprovalTasks,
      Suppliers,
      CostCenters,
      FinancialRatings
    } = this.entities as Record<string, any>;
    const { Countries } = cds.entities('sap.common') as Record<string, any>;

    this.entityRefs = {
      PurchaseRequisitions,
      PurchaseRequisitionItems,
      ApprovalSteps,
      RequisitionEvents,
      Suppliers,
      CostCenters,
      FinancialRatings,
      Countries
    };

    // ---------------------------------------------------------------- reads
    // A virtual field can only be calculated from data that was actually read,
    // so if the client asks for the criticality we quietly add the column it
    // is derived from to the query.
    this.before('READ', Suppliers, (req) => {
      const columns = (req.query as any)?.SELECT?.columns as Array<{ ref?: string[] }> | undefined;
      if (!columns) return;
      const asks = (name: string): boolean =>
        columns.some((column) => column.ref?.[column.ref.length - 1] === name);
      if (asks('riskScoreCriticality') && !asks('riskClass_code')) {
        columns.push({ ref: ['riskClass_code'] });
      }
    });

    this.after('READ', Suppliers, (rows: unknown) => {
      const list = Array.isArray(rows) ? rows : [rows];
      for (const row of list as Array<Record<string, unknown>>) {
        if (row && row.riskClass_code !== undefined) {
          row.riskScoreCriticality = criticalityForRiskClass(row.riskClass_code as string | null);
        }
      }
    });

    // Approver inbox: only what the calling user may decide on next. The
    // filter runs in the database; roles and segregation of duties are the
    // same rules validateDecision() enforces when the button is pressed.
    this.before('READ', MyApprovalTasks, (req) => {
      const levels = decidableLevels(req.user);
      const query = req.query as any;
      query.where({ pendingApprovalLevel: { in: levels.length ? levels : [-1] } });
      query.where({ requester: { '!=': req.user.id }, createdBy: { '!=': req.user.id } });
    });

    // ------------------------------------------------------- determinations
    // Runs on draft activation and on every direct write. Keeps item numbers,
    // net amounts, total value, risk class and the required approval level in
    // sync with the item data - the client never sends these fields.
    this.before(['CREATE', 'UPDATE'], PurchaseRequisitions, (req) => this.deriveHeaderFields(req));
    this.before('SAVE', PurchaseRequisitions, (req) => this.deriveHeaderFields(req));

    // Item level determination. Backs the @Common.SideEffects annotations in
    // app/purchase-requisitions/annotations.cds: picking a material defaults
    // description, unit and price, and any change to quantity or price
    // recalculates the net amount.
    //
    // Registered twice on purpose. CREATE and UPDATE cover the non draft API
    // (interfaces, tests, mass updates); NEW and PATCH are the draft events and
    // have to be registered on the *draft* entity, not on the active one.
    // Miss the second registration and the determination silently does nothing
    // in the Fiori object page - which is where users actually spend time.
    this.before(['CREATE', 'UPDATE'], PurchaseRequisitionItems, (req) => this.deriveItemFields(req));
    this.before(['NEW', 'PATCH'], PurchaseRequisitionItems.drafts, (req) => this.deriveItemFields(req));

    // ------------------------------------------------------------- actions
    this.on('submit', PurchaseRequisitions, (req) => this.onSubmit(req));
    this.on('approve', PurchaseRequisitions, (req) => this.onDecision(req, 'approve'));
    this.on('rejectRequisition', PurchaseRequisitions, (req) => this.onDecision(req, 'reject'));
    this.on('withdraw', PurchaseRequisitions, (req) => this.onWithdraw(req));
    this.on('close', PurchaseRequisitions, (req) => s4.convertToPurchaseOrder(req, this.s4Deps()));
    this.on('reopen', PurchaseRequisitions, (req) => this.onReopen(req));

    this.on('approve', MyApprovalTasks, (req) => this.onDecision(req, 'approve'));
    this.on('rejectRequisition', MyApprovalTasks, (req) => this.onDecision(req, 'reject'));

    this.on('recalculateRisk', Suppliers, (req) => this.onRecalculateRisk(req));
    this.on('updateFinancialRating', Suppliers, (req) => s4.updateFinancialRating(req, this.s4Deps()));
    this.on('syncSuppliersFromS4', (req) => s4.syncSuppliersFromS4(req, this.s4Deps()));
    this.on('recalculateAllSupplierRisks', (req) => this.onRecalculateAllRisks(req));
    this.on('currentUser', (req) => ({ id: req.user.id, roles: knownRolesOf(req.user) }));

    await super.init();
  }

  /** What the S/4HANA handlers are allowed to use from this service. */
  private s4Deps(): s4.S4Deps {
    return {
      entities: this.entityRefs,
      loadRequisition: (id, req) => this.loadRequisition(id, req),
      readActive: (id) => this.readActive(id),
      logEvent: (req, id, eventType, details) => this.logEvent(req, id, eventType, details),
      assessSupplier: (id, req) => this.assessSupplierById(id, req)
    };
  }

  // ==================================================================
  // Determinations
  // ==================================================================

  /**
   * Fills every derived header and item field from the item data.
   *
   * Handles both shapes CAP can deliver: a deep payload (draft activation or a
   * deep insert, where `req.data.items` is present) and a shallow one (a plain
   * PATCH on the header), in which case the items are read from the database.
   */
  private async deriveHeaderFields(req: cds.Request): Promise<void> {
    const data = req.data as Record<string, any> | undefined;
    if (!data) return;

    const id: string | undefined = data.ID ?? keyOf(req);
    const items: Array<Record<string, any>> = Array.isArray(data.items)
      ? data.items
      : await this.readItems(id);

    if (items.length === 0) {
      if (Object.prototype.hasOwnProperty.call(data, 'items') || id) {
        data.totalValue = 0;
        data.supplierRiskClass_code = null;
        data.requiredApprovalLevel_code = null;
      }
      return;
    }

    // Item numbers follow the SAP convention 10, 20, 30 ...
    items.forEach((item, index) => {
      item.itemNumber = (index + 1) * 10;
      item.netAmount = lineAmount(item.quantity, item.unitPrice);
    });

    const supplierIds = [...new Set(items.map((item) => item.supplier_ID).filter(Boolean))] as string[];
    const riskClasses = await this.readSupplierRiskClasses(supplierIds);

    data.totalValue = sumAmounts(items.map((item) => item.netAmount));
    data.supplierRiskClass_code = risk.worstRiskClass(supplierIds.map((sid) => riskClasses.get(sid)));
    data.requiredApprovalLevel_code = policy.determineRequiredLevel({
      totalValue: data.totalValue,
      riskClass: data.supplierRiskClass_code
    });
  }

  /**
   * Defaults item fields from the material master and keeps the net amount in
   * sync with quantity and unit price.
   *
   * On a PATCH the client usually sends one field only, so the counterpart is
   * read from `req.subject` - which resolves to the draft row while the
   * requisition is being edited and to the active row afterwards.
   */
  private async deriveItemFields(req: cds.Request): Promise<void> {
    const data = req.data as Record<string, any> | undefined;
    if (!data) return;

    const { Materials } = cds.entities('acme.procurement') as Record<string, any>;

    if (data.material_ID) {
      const material = await SELECT.one.from(Materials).where({ ID: data.material_ID });
      if (material) {
        data.description ??= material.description;
        data.unit ??= material.baseUnit;
        data.unitPrice ??= material.standardPrice;
        data.currency_code ??= material.currency_code;
      }
    }

    const touchesAmount = data.quantity !== undefined || data.unitPrice !== undefined;
    if (!touchesAmount) return;

    let quantity: Amount = data.quantity;
    let unitPrice: Amount = data.unitPrice;

    const isCreate = req.event === 'CREATE' || req.event === 'NEW';
    if (!isCreate && (quantity === undefined || unitPrice === undefined)) {
      const current = await SELECT.one.from(req.subject).columns('quantity', 'unitPrice');
      quantity ??= current?.quantity;
      unitPrice ??= current?.unitPrice;
    }

    data.netAmount = lineAmount(quantity ?? 0, unitPrice ?? 0);
  }

  // ==================================================================
  // Actions
  // ==================================================================

  /**
   * Submits a requisition for approval.
   * Validates first, then assigns the document number and materialises the
   * full approval chain so the object page can show it up front.
   */
  private async onSubmit(req: cds.Request): Promise<unknown> {
    const { PurchaseRequisitions, ApprovalSteps } = this.entityRefs;
    const id = keyOf(req);
    const requisition = await this.loadRequisition(id, req);
    if (!requisition) return;

    if (!policy.canPerform('submit', requisition.status_code)) {
      return req.error({
        code: policy.MSG.INVALID_TRANSITION,
        message: 'SUBMIT_ONLY_DRAFT',
        args: [requisition.status_code ?? ''],
        status: 400
      });
    }

    if (!this.mayEdit(req, requisition)) return;

    const derived = await this.recalculate(requisition);
    const costCenter = await this.readCostCenter(requisition.costCenter_ID);
    const findings = policy.validateForSubmission({
      requisition,
      items: derived.items,
      costCenter,
      today: today(req)
    });

    if (findings.length > 0) return raise(req, findings);

    // Persist what the recalculation produced. Items can have been changed
    // through a channel that does not run the item determination - a data
    // migration, an inbound interface, a mass update - and submitting is the
    // point where the document has to be internally consistent.
    await this.persistItemValues(derived.items);

    const requisitionNumber = requisition.requisitionNumber ?? (await this.assignRequisitionNumber(req));

    await UPDATE(PurchaseRequisitions, id).with({
      requisitionNumber,
      totalValue: derived.totalValue,
      supplierRiskClass_code: derived.riskClass,
      requiredApprovalLevel_code: derived.requiredLevel,
      currentApprovalLevel: 0,
      status_code: policy.STATUS.IN_APPROVAL,
      submittedAt: req.timestamp,
      completedAt: null,
      rejectionReason: null
    });

    // Rebuild the chain from scratch - a resubmitted requisition may need a
    // different number of levels than the previous attempt.
    await DELETE.from(ApprovalSteps).where({ requisition_ID: id });
    await INSERT.into(ApprovalSteps).entries(
      policy.buildApprovalChain(derived.requiredLevel).map((step) => ({
        requisition_ID: id,
        level_code: step.level,
        decision_code: step.decision
      }))
    );
    await this.logEvent(req, id, EVENT.SUBMITTED);

    return this.readActive(id);
  }

  /** Approves or rejects the next open approval level. */
  private async onDecision(req: cds.Request, action: 'approve' | 'reject'): Promise<unknown> {
    const { PurchaseRequisitions, ApprovalSteps } = this.entityRefs;
    const id = keyOf(req);
    const requisition = await this.loadRequisition(id, req);
    if (!requisition) return;

    const findings = policy.validateDecision({
      requisition,
      action,
      user: req.user.id,
      roles: rolesOf(req.user)
    });
    if (findings.length > 0) return raise(req, findings);

    const level = policy.nextApprovalLevel(requisition.currentApprovalLevel);
    const data = req.data as { comment?: string; reason?: string };
    const comment = action === 'approve' ? (data.comment ?? null) : data.reason;

    await UPDATE(ApprovalSteps)
      .set({
        decision_code: action === 'approve' ? policy.DECISION.APPROVED : policy.DECISION.REJECTED,
        decidedBy: req.user.id,
        decidedAt: req.timestamp,
        comment
      })
      .where({ requisition_ID: id, level_code: level });

    if (action === 'reject') {
      // Everything that was still open is obsolete once one level says no.
      await UPDATE(ApprovalSteps)
        .set({ decision_code: policy.DECISION.SKIPPED })
        .where({ requisition_ID: id, decision_code: policy.DECISION.PENDING });

      await UPDATE(PurchaseRequisitions, id).with({
        status_code: policy.STATUS.REJECTED,
        rejectionReason: data.reason,
        completedAt: req.timestamp
      });
      await this.logEvent(req, id, EVENT.REJECTED, { approvalLevel: level, note: data.reason });
      return this.readActive(id);
    }

    const isFinal = policy.isFinalApproval(level, requisition.requiredApprovalLevel_code);
    await UPDATE(PurchaseRequisitions, id).with({
      currentApprovalLevel: level,
      status_code: isFinal ? policy.STATUS.APPROVED : policy.STATUS.IN_APPROVAL,
      completedAt: isFinal ? req.timestamp : null
    });

    // The budget is committed the moment the last signature is there, not when
    // the purchase order is created - otherwise two requisitions could both
    // pass the budget check against the same remaining amount.
    if (isFinal) await this.commitBudget(requisition);
    await this.logEvent(req, id, EVENT.APPROVED, { approvalLevel: level, note: comment });

    return this.readActive(id);
  }

  /** Pulls a submitted requisition back into editing. */
  private async onWithdraw(req: cds.Request): Promise<unknown> {
    const { PurchaseRequisitions, ApprovalSteps } = this.entityRefs;
    const id = keyOf(req);
    const requisition = await this.loadRequisition(id, req);
    if (!requisition) return;

    if (!policy.canPerform('withdraw', requisition.status_code)) {
      return req.error({
        code: policy.MSG.INVALID_TRANSITION,
        message: 'WITHDRAW_NOT_ALLOWED',
        args: [requisition.status_code ?? ''],
        status: 400
      });
    }
    if (!this.mayEdit(req, requisition)) return;

    if (Number(requisition.currentApprovalLevel) > 0) {
      return req.error({
        code: policy.MSG.INVALID_TRANSITION,
        message: 'WITHDRAW_ALREADY_APPROVED',
        status: 400
      });
    }

    await DELETE.from(ApprovalSteps).where({ requisition_ID: id });
    await UPDATE(PurchaseRequisitions, id).with({
      status_code: policy.STATUS.DRAFT,
      submittedAt: null,
      currentApprovalLevel: 0
    });
    await this.logEvent(req, id, EVENT.WITHDRAWN);
    return this.readActive(id);
  }

  /** Puts a rejected requisition back into draft for rework. */
  private async onReopen(req: cds.Request): Promise<unknown> {
    const { PurchaseRequisitions, ApprovalSteps } = this.entityRefs;
    const id = keyOf(req);
    const requisition = await this.loadRequisition(id, req);
    if (!requisition) return;

    if (!policy.canPerform('reopen', requisition.status_code)) {
      return req.error({
        code: policy.MSG.INVALID_TRANSITION,
        message: 'REOPEN_ONLY_REJECTED',
        args: [requisition.status_code ?? ''],
        status: 400
      });
    }
    if (!this.mayEdit(req, requisition)) return;

    await DELETE.from(ApprovalSteps).where({ requisition_ID: id });
    await UPDATE(PurchaseRequisitions, id).with({
      status_code: policy.STATUS.DRAFT,
      submittedAt: null,
      completedAt: null,
      rejectionReason: null,
      currentApprovalLevel: 0
    });
    await this.logEvent(req, id, EVENT.REOPENED);
    return this.readActive(id);
  }

  /** Recalculates the risk score of a single supplier. */
  private async onRecalculateRisk(req: cds.Request): Promise<unknown> {
    const id = keyOf(req);
    const result = await this.assessSupplierById(id, req);
    if (!result) return;
    return SELECT.one.from(this.entityRefs.Suppliers).where({ ID: id });
  }

  /** Recalculates every supplier. Entry point for the nightly job. */
  private async onRecalculateAllRisks(req: cds.Request): Promise<{ evaluated: number; changed: number }> {
    const { Suppliers } = this.entityRefs;
    const suppliers: Array<{ ID: string; riskScore?: number | null }> = await SELECT.from(Suppliers).columns(
      'ID',
      'riskScore'
    );
    let changed = 0;

    for (const supplier of suppliers) {
      const result = await this.assessSupplierById(supplier.ID, req);
      if (result && result.assessment.score !== supplier.riskScore) changed += 1;
    }

    return { evaluated: suppliers.length, changed };
  }

  // ==================================================================
  // Data access helpers
  // ==================================================================

  /** Reads the active (non draft) header. */
  async readActive(id: string | undefined): Promise<RequisitionRow | undefined> {
    return SELECT.one.from(this.entityRefs.PurchaseRequisitions).where({ ID: id });
  }

  /** Reads the header and raises a 404 if it does not exist. */
  async loadRequisition(id: string | undefined, req: cds.Request): Promise<RequisitionRow | null> {
    const requisition = await this.readActive(id);
    if (!requisition) {
      req.error({ code: 'PR404', message: 'REQUISITION_NOT_FOUND', args: [id ?? ''], status: 404 });
      return null;
    }
    return requisition;
  }

  private async readItems(requisitionId: string | undefined): Promise<Array<Record<string, any>>> {
    if (!requisitionId) return [];
    return SELECT.from(this.entityRefs.PurchaseRequisitionItems).where({ requisition_ID: requisitionId });
  }

  private async readCostCenter(costCenterId: string | null | undefined): Promise<CostCenterRow | null> {
    if (!costCenterId) return null;
    return (await SELECT.one.from(this.entityRefs.CostCenters).where({ ID: costCenterId })) ?? null;
  }

  /** Resolves the risk class of a set of suppliers, keyed by supplier ID. */
  private async readSupplierRiskClasses(supplierIds: readonly string[]): Promise<Map<string, string>> {
    if (supplierIds.length === 0) return new Map();
    const rows: Array<{ ID: string; riskClass_code: string }> = await SELECT.from(this.entityRefs.Suppliers)
      .columns('ID', 'riskClass_code')
      .where({ ID: { in: supplierIds } });
    return new Map(rows.map((row) => [row.ID, row.riskClass_code]));
  }

  /**
   * Recomputes total value, risk class and required level from the persisted
   * items. Used by `submit`, which must not trust whatever the header happens
   * to carry at that moment.
   */
  private async recalculate(requisition: RequisitionRow): Promise<Recalculation> {
    const items = await this.readItems(requisition.ID);

    const supplierIds = [...new Set(items.map((item) => item.supplier_ID).filter(Boolean))] as string[];
    const suppliers: Array<{ ID: string; name: string; isBlocked: boolean; riskClass_code: string }> =
      supplierIds.length
        ? await SELECT.from(this.entityRefs.Suppliers)
            .columns('ID', 'name', 'isBlocked', 'riskClass_code')
            .where({ ID: { in: supplierIds } })
        : [];
    const supplierById = new Map(suppliers.map((supplier) => [supplier.ID, supplier]));

    const enriched: EnrichedItem[] = items.map((item) => ({
      ...(item as EnrichedItem),
      storedNetAmount: item.netAmount,
      storedItemNumber: item.itemNumber,
      netAmount: lineAmount(item.quantity, item.unitPrice),
      supplier: supplierById.get(item.supplier_ID) ?? null
    }));

    const totalValue = sumAmounts(enriched.map((item) => item.netAmount));
    const riskClass = risk.worstRiskClass(supplierIds.map((id) => supplierById.get(id)?.riskClass_code));

    return {
      items: enriched,
      totalValue,
      riskClass,
      requiredLevel: policy.determineRequiredLevel({ totalValue, riskClass })
    };
  }

  /**
   * Writes back the item numbers and net amounts computed by `recalculate`.
   * Only touches rows whose stored values actually differ.
   */
  private async persistItemValues(items: readonly EnrichedItem[]): Promise<void> {
    const { PurchaseRequisitionItems } = this.entityRefs;

    const updates = items
      .map((item, index) => ({ item, itemNumber: (index + 1) * 10 }))
      .filter(
        ({ item, itemNumber }) =>
          Number(item.storedItemNumber) !== itemNumber ||
          toMinorUnits(item.storedNetAmount) !== toMinorUnits(item.netAmount)
      )
      .map(({ item, itemNumber }) =>
        UPDATE(PurchaseRequisitionItems, item.ID).with({ itemNumber, netAmount: item.netAmount })
      );

    await Promise.all(updates);
  }

  /**
   * Assigns the next document number for the current year.
   *
   * A productive implementation would call a number range object (ABAP:
   * NUMBER_GET_NEXT / cl_numberrange_runtime) to stay gap free under load.
   * Reading the current maximum is good enough for a demo landscape and is
   * documented as such in docs/adr/0005-number-assignment.md.
   */
  private async assignRequisitionNumber(req: cds.Request): Promise<string> {
    const year = new Date(req.timestamp).getUTCFullYear();
    const prefix = `PR-${year}-`;
    const rows: Array<{ requisitionNumber: string }> = await SELECT.from(this.entityRefs.PurchaseRequisitions)
      .columns('requisitionNumber')
      .where({ requisitionNumber: { like: `${prefix}%` } })
      .orderBy('requisitionNumber desc')
      .limit(1);

    const last = rows[0]?.requisitionNumber;
    const next = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  }

  /** Adds the approved value to the consumed budget of the cost center. */
  private async commitBudget(requisition: RequisitionRow): Promise<void> {
    const costCenter = await this.readCostCenter(requisition.costCenter_ID);
    if (!costCenter) return;
    await UPDATE(this.entityRefs.CostCenters, costCenter.ID).with({
      consumedBudget: sumAmounts([costCenter.consumedBudget, requisition.totalValue])
    });
  }

  /**
   * Resolves the rating tables, runs the scoring and persists the result. If
   * the risk class changed, the approval path of every open requisition that
   * uses the supplier is adjusted right away.
   */
  async assessSupplierById(
    supplierId: string | undefined,
    req: cds.Request
  ): Promise<{ assessment: risk.RiskAssessment; adjustedRequisitions: number } | null> {
    // One query, two expands: the rating table and the country risk table are
    // joined in the database rather than fetched one by one. This matters for
    // the bulk run, which would otherwise fire 3 statements per supplier.
    const supplier = await SELECT.one
      .from(this.entityRefs.Suppliers)
      .where({ ID: supplierId })
      .columns((supplierRow: any) => {
        supplierRow('*');
        // In CAP's column projection callback, naming a field IS how you
        // select it - the expression is the API, not a mistake. There is no
        // assignment to make, so the rule has to be waived here.
        /* eslint-disable @typescript-eslint/no-unused-expressions */
        supplierRow.financialRating((rating: any) => {
          rating.riskPoints;
        });
        supplierRow.countryRisk((country: any) => {
          country.riskPoints;
        });
        /* eslint-enable @typescript-eslint/no-unused-expressions */
      });

    if (!supplier) {
      req.error({ code: 'PR405', message: 'SUPPLIER_NOT_FOUND', args: [supplierId ?? ''], status: 404 });
      return null;
    }

    const assessment = risk.assessSupplier({
      isBlocked: supplier.isBlocked,
      financialRatingPoints: supplier.financialRating?.riskPoints,
      countryRiskPoints: supplier.countryRisk?.riskPoints,
      onTimeDeliveryRate: supplier.onTimeDeliveryRate,
      qualityIncidents12M: supplier.qualityIncidents12M,
      isoCertified: supplier.isoCertified
    });

    await UPDATE(this.entityRefs.Suppliers, supplierId).with({
      riskScore: assessment.score,
      riskClass_code: assessment.riskClass,
      riskCalculatedAt: req.timestamp
    });

    const adjustedRequisitions =
      assessment.riskClass !== supplier.riskClass_code
        ? await this.adjustOpenRequisitions(supplier, supplier.riskClass_code, assessment.riskClass, req)
        : 0;

    return { assessment, adjustedRequisitions };
  }

  /**
   * Re-derives risk class and approval path of every draft or in-approval
   * requisition with an item from this supplier. A requisition in approval
   * only ever gets stricter: missing levels are appended as pending steps and
   * the change is written to its audit trail.
   *
   * @returns number of requisitions whose required approval level changed
   */
  private async adjustOpenRequisitions(
    supplier: { ID: string; name?: string | null },
    previousClass: string | null | undefined,
    newClass: string,
    req: cds.Request
  ): Promise<number> {
    const { PurchaseRequisitions, PurchaseRequisitionItems, ApprovalSteps } = this.entityRefs;

    const affected: Array<{ requisition_ID: string }> = await SELECT.distinct
      .from(PurchaseRequisitionItems)
      .columns('requisition_ID')
      .where({ supplier_ID: supplier.ID });
    if (affected.length === 0) return 0;

    const requisitions: RequisitionRow[] = await SELECT.from(PurchaseRequisitions).where({
      ID: { in: affected.map((row) => row.requisition_ID) },
      status_code: { in: [policy.STATUS.DRAFT, policy.STATUS.IN_APPROVAL] }
    });

    let adjusted = 0;
    for (const requisition of requisitions) {
      const derived = await this.recalculate(requisition);
      const path = policy.reassessApprovalPath({
        status: requisition.status_code,
        totalValue: derived.totalValue,
        riskClass: derived.riskClass,
        requiredLevel: requisition.requiredApprovalLevel_code
      });

      await UPDATE(PurchaseRequisitions, requisition.ID).with({
        supplierRiskClass_code: derived.riskClass,
        requiredApprovalLevel_code: path.requiredLevel
      });
      if (!path.changed) continue;

      adjusted += 1;
      if (path.addedLevels.length) {
        await INSERT.into(ApprovalSteps).entries(
          path.addedLevels.map((level) => ({
            requisition_ID: requisition.ID,
            level_code: level,
            decision_code: policy.DECISION.PENDING
          }))
        );
      }
      await this.logEvent(req, requisition.ID, EVENT.PATH_ADJUSTED, {
        approvalLevel: path.requiredLevel,
        note:
          `${supplier.name ?? ''}: ${previousClass ?? '-'} -> ${newClass}, ` +
          `L${requisition.requiredApprovalLevel_code ?? '-'} -> L${path.requiredLevel}`
      });
    }
    return adjusted;
  }

  /** Appends one entry to the audit trail of a requisition. */
  async logEvent(
    req: cds.Request,
    requisitionId: string | undefined,
    eventType: EventType,
    details: { approvalLevel?: number; note?: string | null } = {}
  ): Promise<void> {
    if (!requisitionId) return;
    await INSERT.into(this.entityRefs.RequisitionEvents).entries({
      requisition_ID: requisitionId,
      eventType_code: eventType,
      occurredAt: req.timestamp,
      actor: req.user.id,
      approvalLevel: details.approvalLevel ?? null,
      note: details.note ?? null
    });
  }

  // ==================================================================
  // Authorisation helpers
  // ==================================================================

  /**
   * Only the requester, the creator or a procurement admin may move a
   * requisition through the requester side of the lifecycle.
   *
   * @returns false if an error was raised
   */
  private mayEdit(req: cds.Request, requisition: RequisitionRow): boolean {
    const user = req.user;
    if (user.is('ProcurementAdmin')) return true;
    if (requisition.requester === user.id || requisition.createdBy === user.id) return true;

    req.error({
      code: 'PR403',
      message: 'ONLY_REQUESTER',
      status: 403
    });
    return false;
  }
}
