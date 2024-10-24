@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase requisition - interface view'
@Metadata.ignorePropagatedAnnotations: true
@ObjectModel.usageType: {
  serviceQuality: #X_LARGE,
  sizeCategory: #S,
  dataClass: #TRANSACTIONAL
}
define root view entity ZI_PR_Requisition
  as select from zpr_req_hdr
  composition [0..*] of ZI_PR_ReqItem  as _Item
  composition [0..*] of ZI_PR_Approval as _Approval
{
  key requisition_uuid            as RequisitionUUID,

      requisition_number          as RequisitionNumber,
      title                       as Title,
      description                 as Description,
      requester                   as Requester,
      cost_center                 as CostCenter,

      @Semantics.amount.currencyCode: 'Currency'
      total_value                 as TotalValue,
      currency                    as Currency,

      status                      as Status,
      supplier_risk_class         as SupplierRiskClass,
      required_approval_level     as RequiredApprovalLevel,
      current_approval_level      as CurrentApprovalLevel,

      submitted_at                as SubmittedAt,
      completed_at                as CompletedAt,
      rejection_reason            as RejectionReason,

      @Semantics.user.createdBy: true
      created_by                  as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at                  as CreatedAt,
      @Semantics.user.lastChangedBy: true
      last_changed_by             as LastChangedBy,
      // Total ETag: changes whenever the document or any of its children change
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at             as LastChangedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at       as LocalLastChangedAt,

      _Item,
      _Approval
}
