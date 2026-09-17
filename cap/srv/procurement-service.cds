using { acme.procurement as db } from '../db/schema';

/**
 * Transactional service behind the "Manage Purchase Requisitions" Fiori app.
 *
 * Authorisation model (see docs/architecture.md):
 *   Requester        - creates and edits own requisitions, submits them
 *   ApproverL1..L3   - decides on the level they are assigned to
 *   ProcurementAdmin - maintains supplier master data, recalculates risk
 *
 * Outbound integration (srv/external): supplier master data is read from the
 * S/4HANA Business Partner API, purchase orders are created through the
 * S/4HANA Purchase Order API.
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
        @title: '{i18n>Comment}'
        comment : String(500)
      ) returns PurchaseRequisitions;

      /**
       * Rejects the requisition and sends it back to the requester.
       * Named `rejectRequisition` rather than `reject` on purpose: `reject` is
       * already a method of cds.ApplicationService and would be shadowed.
       */
      @title: '{i18n>ActionReject}'
      action rejectRequisition(
        @title: '{i18n>RejectionReason}'
        @mandatory
        reason : String(500)
      ) returns PurchaseRequisitions;

      /** Pulls a submitted requisition back into editing. Requester only. */
      action withdraw() returns PurchaseRequisitions;

      /**
       * Converts an approved requisition into purchase orders in S/4HANA - one
       * per supplier - and closes it. Named `close` for parity with the ABAP
       * implementation, where the purchase order is created on-stack.
       */
      action close() returns PurchaseRequisitions;

      /** Puts a rejected requisition back into draft so it can be reworked. */
      action reopen() returns PurchaseRequisitions;
    };

  entity PurchaseRequisitionItems as projection on db.PurchaseRequisitionItems;

  @readonly
  entity ApprovalSteps as projection on db.ApprovalSteps;

  @readonly
  entity RequisitionEvents as projection on db.RequisitionEvents;

  /**
   * Approver inbox: requisitions waiting for a decision by the calling user.
   *
   * Filtered in the database by a before-READ handler - on the level that has
   * to decide next, the approval roles the user holds, and segregation of
   * duties (never your own requisition). Approve and reject work right here,
   * so an approver does not have to open each document.
   */
  @readonly
  @cds.redirection.target: false
  entity MyApprovalTasks as projection on db.PurchaseRequisitions {
    ID,
    requisitionNumber,
    title,
    description,
    requester,
    costCenter,
    currency,
    totalValue,
    status,
    supplierRiskClass,
    requiredApprovalLevel,
    currentApprovalLevel,
    pendingApprovalLevel,
    submittedAt,
    createdBy
  } where status.code = 'IA'
    actions {
      action approve(
        @title: '{i18n>Comment}'
        comment : String(500)
      ) returns MyApprovalTasks;

      @title: '{i18n>ActionReject}'
      action rejectRequisition(
        @title: '{i18n>RejectionReason}'
        @mandatory
        reason : String(500)
      ) returns MyApprovalTasks;
    };

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
    excluding { items, approvalSteps, events };

  @(restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'ProcurementAdmin' },
    // A bound action needs its own grant - entity level CRUD rights do not
    // imply the right to run it.
    { grant: ['recalculateRisk', 'updateFinancialRating'], to: 'ProcurementAdmin' }
  ])
  entity Suppliers as projection on db.Suppliers {
    *,
    // Calculated on read (see after READ handler), not persisted. Drives the
    // colour of the risk score in the list report.
    virtual null as riskScoreCriticality : Integer,
    // The stored rate is a share (0.62); a list report reads better as 62 %.
    cast(round(onTimeDeliveryRate * 100, 0) as Integer) as onTimeDeliveryPercent : Integer
  }
    actions {
      /** Recalculates the risk score from the current master data attributes. */
      action recalculateRisk() returns Suppliers;

      /**
       * Takes over a new rating from the rating agency feed, recalculates the
       * risk and adjusts the approval path of open requisitions.
       */
      action updateFinancialRating(
        @title: '{i18n>FinancialRating}'
        @mandatory
        @Common.ValueListWithFixedValues
        @Common.ValueList: {
          CollectionPath: 'FinancialRatings',
          Parameters: [
            { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: rating, ValueListProperty: 'code' },
            { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'descr' }
          ]
        }
        rating : String(3)
      ) returns Suppliers;
    };

  /**
   * Who is calling, and with which of the roles this service knows about.
   * Feeds the user menu and the onboarding tour of the UI shell - the UI never
   * decides anything based on it, the service checks every request itself.
   */
  function currentUser() returns {
    id    : String;
    roles : many String;
  };

  /**
   * Takes over name, country and purchasing block of all suppliers from the
   * S/4HANA Business Partner API, creates suppliers that are new there, and
   * recalculates the risk of every supplier that changed - including the
   * approval path of open requisitions that use it.
   */
  @requires: 'ProcurementAdmin'
  action syncSuppliersFromS4() returns {
    created   : Integer;
    updated   : Integer;
    unchanged : Integer;
    /** Open requisitions whose approval path had to be adjusted. */
    adjustedRequisitions : Integer;
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
  @readonly entity RequisitionEventTypes as projection on db.RequisitionEventTypes;
}
