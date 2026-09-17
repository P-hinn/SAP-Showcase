using { acme.procurement as db } from '../db/schema';

/**
 * Transactional service behind the "Manage Purchase Requisitions" Fiori app.
 *
 * Authorisation model (see docs/architecture.md):
 *   Requester        - creates and edits own requisitions, submits them
 *   ApproverL1..L3   - decides on the level they are assigned to
 *   ProcurementAdmin - maintains supplier master data, recalculates risk
 */
@path: '/procurement'
@requires: 'authenticated-user'
service ProcurementService {

  @odata.draft.enabled
  @Capabilities.FilterRestrictions.NonFilterableProperties: [ 'totalValue' ]
  entity PurchaseRequisitions as projection on db.PurchaseRequisitions
    actions {
      /** Runs all submit validations and starts the approval chain. */
      @cds.odata.bindingparameter.name: '_requisition'
      action submit() returns PurchaseRequisitions;

      /** Approves the next open level. Completes the requisition on the last level. */
      action approve(
        @title: 'Comment'
        comment : String(500)
      ) returns PurchaseRequisitions;

      /**
       * Rejects the requisition and sends it back to the requester.
       * Named `rejectRequisition` rather than `reject` on purpose: `reject` is
       * already a method of cds.ApplicationService and would be shadowed.
       */
      @title: 'Reject'
      action rejectRequisition(
        @title: 'Reason'
        @mandatory
        reason : String(500)
      ) returns PurchaseRequisitions;

      /** Pulls a submitted requisition back into editing. Requester only. */
      action withdraw() returns PurchaseRequisitions;

      /** Marks an approved requisition as converted into a purchase order. */
      action close() returns PurchaseRequisitions;

      /** Puts a rejected requisition back into draft so it can be reworked. */
      action reopen() returns PurchaseRequisitions;
    };

  entity PurchaseRequisitionItems as projection on db.PurchaseRequisitionItems;

  @readonly
  entity ApprovalSteps as projection on db.ApprovalSteps;

  /**
   * Personal worklist. Demonstrates instance based authorisation: the where
   * clause is pushed into the database query, so a requester physically cannot
   * read another department's demand through this entity set.
   */
  @readonly
  // Not a redirection target: associations pointing to purchase requisitions
  // must resolve to the full entity set, not to this filtered worklist.
  @cds.redirection.target: false
  @(restrict: [
    { grant: 'READ', to: 'Requester', where: 'requester = $user' },
    { grant: 'READ', to: 'ProcurementAdmin' }
  ])
  // Header only - a worklist tile does not need the item composition.
  entity MyRequisitions as projection on db.PurchaseRequisitions
    excluding { items, approvalSteps };

  @(restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'ProcurementAdmin' },
    // A bound action needs its own grant - entity level CRUD rights do not
    // imply the right to run it.
    { grant: 'recalculateRisk', to: 'ProcurementAdmin' }
  ])
  entity Suppliers as projection on db.Suppliers {
    *,
    // Calculated on read (see after READ handler), not persisted. Drives the
    // colour of the risk score in the list report.
    virtual null as riskScoreCriticality : Integer
  }
    actions {
      /** Recalculates the risk score from the current master data attributes. */
      action recalculateRisk() returns Suppliers;
    };

  /** Recalculates the risk score of every supplier. Nightly job entry point. */
  @requires: 'ProcurementAdmin'
  action recalculateAllSupplierRisks() returns {
    /** Number of suppliers whose score changed. */
    changed : Integer;
    /** Number of suppliers evaluated. */
    evaluated : Integer;
  };

  @readonly entity Materials      as projection on db.Materials;
  @readonly entity MaterialGroups as projection on db.MaterialGroups;
  @readonly entity CostCenters    as projection on db.CostCenters;
  @readonly entity Plants         as projection on db.Plants;

  @readonly entity RequisitionStatuses as projection on db.RequisitionStatuses;
  @readonly entity RiskClasses         as projection on db.RiskClasses;
  @readonly entity ApprovalLevels      as projection on db.ApprovalLevels;
  @readonly entity ApprovalDecisions   as projection on db.ApprovalDecisions;
  @readonly entity FinancialRatings    as projection on db.FinancialRatings;
  @readonly entity CountryRisks        as projection on db.CountryRisks;
}
