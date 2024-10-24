@EndUserText.label : 'Purchase requisition - item'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zpr_req_itm {

  key client            : abap.clnt not null;
  key item_uuid         : sysuuid_x16 not null;

  /* Foreign key to the header. Managed composition in the behaviour definition. */
  requisition_uuid      : sysuuid_x16 not null;
  item_number           : abap.numc(5);

  product               : abap.char(40);
  description           : abap.char(120);

  @Semantics.quantity.unitOfMeasure : 'zpr_req_itm.quantity_unit'
  quantity              : abap.quan(13,3);
  quantity_unit         : abap.unit(3);

  @Semantics.amount.currencyCode : 'zpr_req_itm.currency'
  unit_price            : abap.curr(15,2);
  @Semantics.amount.currencyCode : 'zpr_req_itm.currency'
  net_amount            : abap.curr(15,2);
  currency              : abap.cuky;

  supplier              : abap.char(10);
  plant                 : abap.char(4);
  delivery_date         : abap.dats;

  created_by            : abp_creation_user;
  created_at            : abp_creation_tstmpl;
  last_changed_by       : abp_lastchange_user;
  last_changed_at       : abp_lastchange_tstmpl;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;

}
