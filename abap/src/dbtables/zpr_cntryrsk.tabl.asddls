@EndUserText.label : 'Country risk - risk points'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #C
@AbapCatalog.dataMaintenance : #ALLOWED
/* Customizing table: OECD country risk categories, refreshed quarterly. */
define table zpr_cntryrsk {
  key client   : abap.clnt not null;
  key country  : land1 not null;
  /* 0 = best, 100 = worst */
  risk_points  : abap.int1;
  description  : abap.char(80);
}
