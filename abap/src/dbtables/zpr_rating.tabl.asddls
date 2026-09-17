@EndUserText.label : 'Financial rating - risk points'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #C
@AbapCatalog.dataMaintenance : #ALLOWED
/* Customizing table: maintained by the compliance department, not by code. */
define table zpr_rating {
  key client      : abap.clnt not null;
  key rating_code : abap.char(3) not null;
  /* 0 = best, 100 = worst */
  risk_points     : abap.int1;
  description     : abap.char(80);
}
