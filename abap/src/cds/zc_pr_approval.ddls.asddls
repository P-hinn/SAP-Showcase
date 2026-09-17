@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Approval step - consumption view'
@Metadata.allowExtensions: true
define view entity ZC_PR_Approval
  as projection on ZI_PR_Approval
{
  key StepUUID,

      RequisitionUUID,
      ApprovalLevel,
      Decision,
      DecidedBy,
      DecidedAt,
      Comments,

      @EndUserText.label: 'Decision criticality'
      @ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_PR_CRITICALITY'
      virtual DecisionCriticality : abap.int1,

      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChangedAt,

      _Requisition : redirected to parent ZC_PR_Requisition
}
