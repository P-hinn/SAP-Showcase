@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase requisition - consumption view'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_PR_Requisition
  provider contract transactional_query
  as projection on ZI_PR_Requisition
{
  key RequisitionUUID,

      @Search.defaultSearchElement: true
      RequisitionNumber,
      @Search.defaultSearchElement: true
      @Search.fuzzinessThreshold: 0.8
      Title,
      Description,
      Requester,
      CostCenter,

      @Semantics.amount.currencyCode: 'Currency'
      TotalValue,
      Currency,

      Status,
      SupplierRiskClass,
      RequiredApprovalLevel,
      CurrentApprovalLevel,

      SubmittedAt,
      CompletedAt,
      RejectionReason,

      /* Virtual, calculated per row - drives the colour of the status field.
         Implemented by ZCL_PR_CRITICALITY. */
      @EndUserText.label: 'Status criticality'
      @ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_PR_CRITICALITY'
      virtual StatusCriticality : abap.int1,

      @EndUserText.label: 'Supplier risk criticality'
      @ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_PR_CRITICALITY'
      virtual SupplierRiskCriticality : abap.int1,

      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChangedAt,

      _Item     : redirected to composition child ZC_PR_ReqItem,
      _Approval : redirected to composition child ZC_PR_Approval
}
