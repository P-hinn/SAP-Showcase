@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Supplier risk - consumption view'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_PR_Supplier
  provider contract transactional_query
  as projection on ZI_PR_Supplier
{
  key Supplier,

      @Search.defaultSearchElement: true
      SupplierName,
      Country,
      PostingIsBlocked,

      FinancialRating,
      OnTimeDeliveryRate,
      QualityIncidents12M,
      IsoCertified,

      RiskScore,
      RiskClass,
      RiskCalculatedAt,

      @EndUserText.label: 'Risk criticality'
      @ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_PR_CRITICALITY'
      virtual RiskCriticality : abap.int1,

      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChangedAt
}
