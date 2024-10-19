@EndUserText.label : 'Cost center budget'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
/*
 * Budget figures per cost center.
 *
 * In a productive landscape `consumed_budget` is not stored at all - it is
 * read from ACDOCA through a released CDS view. It is materialised here so the
 * demo package runs standalone, and the behaviour pool reads it through one
 * method (LCL_SERVICES->READ_COST_CENTER) so that swapping the source touches
 * exactly one place.
 */
define table zpr_costctr {

  key client            : abap.clnt not null;
  key cost_center       : abap.char(10) not null;

  name                  : abap.char(80);
  responsible           : abap.char(60);

  @Semantics.amount.currencyCode : 'zpr_costctr.currency'
  annual_budget         : abap.curr(15,2);
  @Semantics.amount.currencyCode : 'zpr_costctr.currency'
  consumed_budget       : abap.curr(15,2);
  currency              : abap.cuky;

  created_by            : abp_creation_user;
  created_at            : abp_creation_tstmpl;
  last_changed_by       : abp_lastchange_user;
  last_changed_at       : abp_lastchange_tstmpl;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;

}
