@EndUserText.label : 'Purchase requisition - approval step'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zpr_approval {

  key client            : abap.clnt not null;
  key step_uuid         : sysuuid_x16 not null;

  requisition_uuid      : sysuuid_x16 not null;
  approval_level        : abap.int1;
  /* PEND pending, APPR approved, REJE rejected, SKIP skipped */
  decision              : abap.char(4);
  decided_by            : abap.char(60);
  decided_at            : timestampl;
  comments              : abap.string(500);

  created_by            : abp_creation_user;
  created_at            : abp_creation_tstmpl;
  last_changed_by       : abp_lastchange_user;
  last_changed_at       : abp_lastchange_tstmpl;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;

}
