@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Supplier risk input - resolved indicators'
@Metadata.ignorePropagatedAnnotations: true

// Feeds ZCL_PR_RISK_SCORING.
//
// Resolving the two customizing tables in CDS instead of in ABAP means the
// scoring class receives plain numbers and stays free of any SELECT. That is
// what makes it unit testable without a database - the same split as
// srv/lib/risk-scoring.js on the CAP side.
define view entity ZI_PR_SupplierRiskInput
  as select from zpr_sup_risk as Risk
  left outer join I_Supplier   as Master  on Master.Supplier    = Risk.supplier
  left outer join zpr_rating   as Rating  on Rating.rating_code = Risk.financial_rating
  left outer join zpr_cntryrsk as Country on Country.country    = Master.Country
{
  key Risk.supplier              as Supplier,

      Master.PostingIsBlocked    as IsBlocked,
      Rating.risk_points         as FinancialRatingPoints,
      Country.risk_points        as CountryRiskPoints,
      Risk.on_time_delivery_rate as OnTimeDeliveryRate,
      Risk.quality_incidents_12m as QualityIncidents12M,
      Risk.iso_certified         as IsoCertified,

      Risk.risk_score            as StoredRiskScore,
      Risk.risk_class            as StoredRiskClass
}
