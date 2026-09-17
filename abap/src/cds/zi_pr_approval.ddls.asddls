@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase requisition approval step - interface view'
@Metadata.ignorePropagatedAnnotations: true
@ObjectModel.usageType: {
  serviceQuality: #X_LARGE,
  sizeCategory: #S,
  dataClass: #TRANSACTIONAL
}
define view entity ZI_PR_Approval
  as select from zpr_approval
  association to parent ZI_PR_Requisition as _Requisition
    on $projection.RequisitionUUID = _Requisition.RequisitionUUID
{
  key step_uuid             as StepUUID,

      requisition_uuid      as RequisitionUUID,
      approval_level        as ApprovalLevel,
      decision              as Decision,
      decided_by            as DecidedBy,
      decided_at            as DecidedAt,
      comments              as Comments,

      @Semantics.user.createdBy: true
      created_by            as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at            as CreatedAt,
      @Semantics.user.lastChangedBy: true
      last_changed_by       as LastChangedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at       as LastChangedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at as LocalLastChangedAt,

      _Requisition
}
