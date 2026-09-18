namespace acme.procurement;

using { cuid, managed, Currency, Country } from '@sap/cds/common';
using {
  acme.procurement.RequisitionStatuses,
  acme.procurement.RiskClasses,
  acme.procurement.FinancialRatings,
  acme.procurement.CountryRisks,
  acme.procurement.ApprovalDecisions,
  acme.procurement.ApprovalLevels,
  acme.procurement.RequisitionEventTypes,
  acme.procurement.NotificationKinds
} from './code-lists';

/**
 * Purchase requisition header ("Bestellanforderung").
 *
 * Mirrors the RAP business object ZI_PR_Requisition. Amounts are stored in the
 * document currency; the approval matrix works on `totalValue` after conversion
 * to the company code currency (EUR in this demo landscape).
 */
entity PurchaseRequisitions : cuid, managed {
  /** Human readable document number, e.g. PR-2026-000042. Assigned on submit. */
  requisitionNumber   : String(16);
  title               : String(80) @mandatory;
  description         : String(1000);
  /** Business user the requisition belongs to. Not necessarily the creator. */
  requester           : String(60) @mandatory;
  costCenter          : Association to CostCenters @mandatory;
  currency            : Currency;

  /** Sum of all item net amounts. Maintained by a determination, never by the client. */
  totalValue          : Decimal(15, 2) @readonly default 0;

  status              : Association to RequisitionStatuses default 'DR';
  /** Worst risk class across all item suppliers. Drives the approval matrix. */
  supplierRiskClass   : Association to RiskClasses;

  /** Highest approval level required, derived from totalValue x supplierRiskClass. */
  requiredApprovalLevel : Association to ApprovalLevels;
  /** Highest level that has already approved. 0 = nothing approved yet. */
  currentApprovalLevel  : Integer default 0;

  submittedAt         : Timestamp;
  completedAt         : Timestamp;
  /** Free text captured with the last rejection, shown on the object page. */
  rejectionReason     : String(500);

  /**
   * Level that has to decide next, 0 when nobody has to. Calculated on read,
   * so the approver inbox can filter on it in the database.
   */
  pendingApprovalLevel : Integer = (case when status.code = 'IA' then currentApprovalLevel + 1 else 0 end);

  /**
   * Purchase order(s) created in S/4HANA when the requisition was converted -
   * one per supplier, comma separated. The item carries its own number.
   */
  purchaseOrderNumbers : String(100);

  items               : Composition of many PurchaseRequisitionItems
                          on items.requisition = $self;
  approvalSteps       : Composition of many ApprovalSteps
                          on approvalSteps.requisition = $self;
  /** Audit trail: who did what, when. Written by the service, never by the client. */
  events              : Composition of many RequisitionEvents
                          on events.requisition = $self;
}

entity PurchaseRequisitionItems : cuid, managed {
  requisition   : Association to PurchaseRequisitions @mandatory;
  /** 10, 20, 30 ... just like in S/4HANA. Assigned by a determination. */
  itemNumber    : Integer @readonly;
  material      : Association to Materials;
  /** Free text description, defaulted from the material but overridable. */
  description   : String(120) @mandatory;
  quantity      : Decimal(13, 3) @mandatory;
  unit          : String(3) default 'EA';
  unitPrice     : Decimal(15, 2) @mandatory;
  currency      : Currency;
  /** quantity * unitPrice, maintained by a determination. */
  netAmount     : Decimal(15, 2) @readonly default 0;
  supplier      : Association to Suppliers @mandatory;
  plant         : Association to Plants;
  deliveryDate  : Date @mandatory;
  /** S/4HANA purchase order and item this line was converted into. */
  purchaseOrderNumber : String(10);
  purchaseOrderItem   : String(5);
}

/**
 * One row per approval level that is required for a requisition.
 * Created when the requisition is submitted, so the object page can show the
 * full approval chain up front instead of revealing it step by step.
 */
entity ApprovalSteps : cuid, managed {
  requisition : Association to PurchaseRequisitions @mandatory;
  level       : Association to ApprovalLevels @mandatory;
  decision    : Association to ApprovalDecisions default 'PEND';
  decidedBy   : String(60);
  decidedAt   : Timestamp;
  comment     : String(500);
}

/**
 * Audit trail of a requisition. Append only: one row per lifecycle event,
 * including the ones nobody clicked - e.g. an approval path that grew because
 * a supplier was downgraded while the requisition was in approval.
 */
entity RequisitionEvents : cuid {
  requisition   : Association to PurchaseRequisitions @mandatory;
  eventType     : Association to RequisitionEventTypes @mandatory;
  occurredAt    : Timestamp @mandatory;
  actor         : String(60);
  /** Approval level the event refers to, if any. */
  approvalLevel : Integer;
  /** Comment, reason, purchase order number or what changed - language neutral. */
  note          : String(500);
}

/**
 * Supplier master data slice, replicated from S/4HANA (BUT000 / LFA1) and
 * enriched with the compliance attributes the risk score needs.
 */
entity Suppliers : cuid, managed {
  supplierNumber      : String(10) @mandatory;
  name                : String(80) @mandatory;
  country             : Country;
  /** Purchasing block set in the backend. A blocked supplier can never be ordered from. */
  isBlocked           : Boolean default false;
  financialRating     : Association to FinancialRatings;
  /** Share of purchase order items delivered on time in the last 12 months, 0..1. */
  onTimeDeliveryRate  : Decimal(5, 4);
  /** Quality notifications of type Q2/Q3 raised in the last 12 months. */
  qualityIncidents12M : Integer default 0;
  isoCertified        : Boolean default false;

  /**
   * Country risk index of the supplier's country.
   * Unmanaged association: the country code is the join key, there is no
   * separate foreign key column. Modelling it explicitly means the scoring
   * handler can read the risk points in the same query as the supplier
   * instead of firing a second round trip per supplier.
   */
  countryRisk         : Association to CountryRisks on countryRisk.code = country.code;

  /** 0 (best) .. 100 (worst). Derived - see srv/lib/risk-scoring.js. */
  riskScore           : Integer @readonly;
  riskClass           : Association to RiskClasses;
  riskCalculatedAt    : Timestamp @readonly;

  /** Last time name, country and purchasing block were taken over from S/4HANA. */
  s4SyncedAt          : Timestamp @readonly;
}

entity Materials : cuid {
  materialNumber : String(18) @mandatory;
  description    : String(120) @mandatory;
  materialGroup  : Association to MaterialGroups;
  baseUnit       : String(3) default 'EA';
  standardPrice  : Decimal(15, 2);
  currency       : Currency;
}

entity MaterialGroups : cuid {
  groupCode : String(9) @mandatory;
  name      : String(80) @mandatory;
}

/**
 * Cost center incl. the yearly budget the requisition is checked against.
 * In a productive landscape `consumedBudget` would come from ACDOCA rather than
 * being stored redundantly.
 */
entity CostCenters : cuid {
  costCenterCode : String(10) @mandatory;
  name           : String(80) @mandatory;
  responsible    : String(60);
  annualBudget   : Decimal(15, 2);
  consumedBudget : Decimal(15, 2) default 0;
  currency       : Currency;
}

entity Plants : cuid {
  plantCode : String(4) @mandatory;
  name      : String(80) @mandatory;
  country   : Country;
}

/**
 * The approval matrix as maintained data. One row per value tier, ordered by
 * position; `maxValue` is exclusive and empty for the open ended last tier.
 * Seeded with the built-in matrix (APPROVAL_MATRIX), replaced as a whole by an
 * upload - never row by row, so a half-maintained matrix cannot exist.
 */
entity ApprovalThresholds : managed {
  key position : Integer;
      maxValue : Decimal(15, 2);
      levelA   : Integer @mandatory;
      levelB   : Integer @mandatory;
      levelC   : Integer @mandatory;
}

/**
 * A message to a person or to everyone holding a role. Written by the service
 * whenever the audit trail records an event somebody has to act on or hear
 * about (lib/notifications.ts decides who). The in-app bell reads it; an
 * outbound channel (mail, SAP Build Work Zone) would subscribe to the same
 * rows - see ADR 0010.
 */
entity Notifications : cuid {
  requisition   : Association to PurchaseRequisitions @mandatory;
  kind          : Association to NotificationKinds @mandatory;
  /** Exactly one of the two is set. */
  recipientUser : String(60);
  recipientRole : String(40);
  /** Copied so a role notification can skip the requester without a join. */
  requester     : String(60);
  approvalLevel : Integer;
  createdAt     : Timestamp @cds.on.insert: $now;
}
