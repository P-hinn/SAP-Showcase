@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Supplier risk - interface view'
@Metadata.ignorePropagatedAnnotations: true
@ObjectModel.usageType: {
  serviceQuality: #X_LARGE,
  sizeCategory: #S,
  dataClass: #MASTER
}

// The clean core piece of this model.
//
// Name, country and the purchasing block are read from the released standard
// view I_Supplier. Only the risk attributes that S/4HANA has no field for live
// in the custom table ZPR_SUP_RISK. Nothing about the supplier master is
// copied, so a change in the backend is visible here on the next read.
//
// I_Supplier is released with contract C1 (stable API). The exact field names
// differ slightly between S/4HANA releases - check the released object list of
// the target release before transporting.
define root view entity ZI_PR_Supplier
  as select from zpr_sup_risk as Risk
  left outer join I_Supplier  as Master on Master.Supplier = Risk.supplier
{
  key Risk.supplier                  as Supplier,

      Master.SupplierName            as SupplierName,
      Master.Country                 as Country,
      Master.PostingIsBlocked        as PostingIsBlocked,

      Risk.financial_rating          as FinancialRating,
      Risk.on_time_delivery_rate     as OnTimeDeliveryRate,
      Risk.quality_incidents_12m     as QualityIncidents12M,
      Risk.iso_certified             as IsoCertified,

      Risk.risk_score                as RiskScore,
      Risk.risk_class                as RiskClass,
      Risk.risk_calculated_at        as RiskCalculatedAt,

      @Semantics.user.createdBy: true
      Risk.created_by                as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      Risk.created_at                as CreatedAt,
      @Semantics.user.lastChangedBy: true
      Risk.last_changed_by           as LastChangedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      Risk.last_changed_at           as LastChangedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      Risk.local_last_changed_at     as LocalLastChangedAt
}
