@EndUserText.label : 'Purchase requisition - header'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zpr_req_hdr {

  key client                : abap.clnt not null;
  key requisition_uuid      : sysuuid_x16 not null;

  requisition_number        : abap.char(16);
  title                     : abap.char(80);
  description               : abap.string(1000);
  requester                 : abap.char(60);
  cost_center               : abap.char(10);

  @Semantics.amount.currencyCode : 'zpr_req_hdr.currency'
  total_value               : abap.curr(15,2);
  currency                  : abap.cuky;

  /* DR draft, IA in approval, AP approved, RE rejected, CL closed */
  status                    : abap.char(2);
  /* A low, B medium, C high - worst risk class over all item suppliers */
  supplier_risk_class       : abap.char(1);
  required_approval_level   : abap.int1;
  current_approval_level    : abap.int1;

  submitted_at              : timestampl;
  completed_at              : timestampl;
  rejection_reason          : abap.string(500);

  /* Administrative fields consumed by the managed RAP runtime */
  created_by                : abp_creation_user;
  created_at                : abp_creation_tstmpl;
  last_changed_by           : abp_lastchange_user;
  last_changed_at           : abp_lastchange_tstmpl;
  local_last_changed_at     : abp_locinst_lastchange_tstmpl;

}
