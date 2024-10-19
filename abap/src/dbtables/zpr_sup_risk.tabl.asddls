@EndUserText.label : 'Supplier risk attributes'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
/*
 * Extension table, NOT a replica of the supplier master.
 *
 * Name, country and purchasing block stay where they belong - in the released
 * standard view I_Supplier, which ZI_PR_Supplier joins onto this table. Only
 * the attributes that S/4HANA does not know about live here. That is the
 * clean core way of extending master data: extend, do not copy.
 */
define table zpr_sup_risk {

  key client               : abap.clnt not null;
  key supplier             : abap.char(10) not null;

  /* AAA .. D, resolved against ZPR_RATING */
  financial_rating         : abap.char(3);
  /* Share of purchase order items delivered on time, 0.0000 .. 1.0000 */
  on_time_delivery_rate    : abap.dec(5,4);
  quality_incidents_12m    : abap.int2;
  iso_certified            : abap_boolean;

  /* Derived - see ZCL_PR_RISK_SCORING */
  risk_score               : abap.int1;
  risk_class               : abap.char(1);
  risk_calculated_at       : timestampl;

  created_by               : abp_creation_user;
  created_at               : abp_creation_tstmpl;
  last_changed_by          : abp_lastchange_user;
  last_changed_at          : abp_lastchange_tstmpl;
  local_last_changed_at    : abp_locinst_lastchange_tstmpl;

}
