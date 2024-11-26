namespace acme.procurement;

using { sap.common.CodeList } from '@sap/cds/common';

/**
 * Lifecycle status of a purchase requisition.
 * The allowed transitions are owned by srv/lib/approval-policy.js
 * (ABAP counterpart: ZCL_PR_APPROVAL_POLICY).
 */
entity RequisitionStatuses : CodeList {
  key code : String(2) enum {
    draft      = 'DR';
    inApproval = 'IA';
    approved   = 'AP';
    rejected   = 'RE';
    closed     = 'CL';
  };
  /** Drives the colour of the status field in Fiori Elements (1=red, 2=yellow, 3=green) */
  criticality : Integer;
}

/** Aggregated supplier risk class, derived from the risk score. */
entity RiskClasses : CodeList {
  key code : String(1) enum { low = 'A'; medium = 'B'; high = 'C'; };
  criticality : Integer;
}

/** Long term credit rating as supplied by the external rating agency feed. */
entity FinancialRatings : CodeList {
  key code : String(3);
  /** 0 = best, 100 = worst. Input for the risk score. */
  riskPoints : Integer;
}

/** Country risk index, refreshed quarterly from the compliance department. */
entity CountryRisks : CodeList {
  key code : String(2); // ISO 3166-1 alpha-2
  riskPoints : Integer;
}

/** Outcome of a single approval step. */
entity ApprovalDecisions : CodeList {
  key code : String(4) enum {
    pending  = 'PEND';
    approved = 'APPR';
    rejected = 'REJE';
    skipped  = 'SKIP';
  };
  criticality : Integer;
}

/** Approval levels, i.e. who has to sign off. */
entity ApprovalLevels : CodeList {
  key code : Integer enum { teamLead = 1; departmentHead = 2; cfo = 3; };
  /** Role a user needs in order to decide on this level. */
  requiredRole : String(40);
}

/** Kinds of entries in the audit trail of a requisition. */
entity RequisitionEventTypes : CodeList {
  key code : String(4) enum {
    submitted    = 'SUBM';
    approved     = 'APPR';
    rejected     = 'REJE';
    withdrawn    = 'WDRW';
    reopened     = 'REOP';
    ordered      = 'ORDR';
    pathAdjusted = 'PATH';
  };
  criticality : Integer;
}

/** Kinds of notifications (lib/notifications.ts). */
entity NotificationKinds : CodeList {
  key code : String(4) enum {
    approvalNeeded = 'NEED';
    approved       = 'APPR';
    rejected       = 'REJE';
    pathAdjusted   = 'PATH';
    ordered        = 'ORDR';
  };
  criticality : Integer;
}
