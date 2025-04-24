*"* Local handler of the supplier risk business object.
*"*
*"* Same split as the requisition pool: the handler reads and writes, the
*"* scoring itself lives in ZCL_PR_RISK_SCORING and is covered by ABAP Unit.

CLASS lhc_supplier DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR Supplier RESULT result.

    METHODS recalculateRiskOnModify FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Supplier~recalculateRiskOnModify.

    METHODS recalculateRisk FOR MODIFY
      IMPORTING keys FOR ACTION Supplier~recalculateRisk RESULT result.

    METHODS recalculateAllRisks FOR MODIFY
      IMPORTING keys FOR ACTION Supplier~recalculateAllRisks RESULT result.

    "! Scores one supplier and writes the result back.
    "! @parameter result | abap_true if the stored score actually changed
    METHODS score_and_persist
      IMPORTING supplier      TYPE zpr_sup_risk-supplier
      RETURNING VALUE(result) TYPE abap_boolean.

ENDCLASS.


CLASS lhc_supplier IMPLEMENTATION.

  METHOD get_global_authorizations.
    " Supplier master data is maintained by procurement, not by requesters.
    AUTHORITY-CHECK OBJECT 'ZPR_ADMIN' ID 'ACTVT' FIELD '02'.
    DATA(granted) = COND #( WHEN sy-subrc = 0
                            THEN if_abap_behv=>auth-allowed
                            ELSE if_abap_behv=>auth-unauthorized ).

    result-%create                 = granted.
    result-%update                 = granted.
    result-%delete                 = granted.
    result-%action-recalculateRisk = granted.
  ENDMETHOD.


  METHOD recalculateRiskOnModify.
    " Recalculating on every change keeps the score from drifting away from
    " the attributes it is derived from.
    READ ENTITIES OF zi_pr_supplier IN LOCAL MODE
      ENTITY Supplier FIELDS ( Supplier ) WITH CORRESPONDING #( keys )
      RESULT DATA(suppliers).

    LOOP AT suppliers INTO DATA(supplier).
      score_and_persist( supplier-Supplier ).
    ENDLOOP.
  ENDMETHOD.


  METHOD recalculateRisk.

    READ ENTITIES OF zi_pr_supplier IN LOCAL MODE
      ENTITY Supplier FIELDS ( Supplier ) WITH CORRESPONDING #( keys )
      RESULT DATA(suppliers)
      FAILED failed.

    LOOP AT suppliers INTO DATA(supplier).
      score_and_persist( supplier-Supplier ).
    ENDLOOP.

    READ ENTITIES OF zi_pr_supplier IN LOCAL MODE
      ENTITY Supplier ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(final).

    result = VALUE #( FOR row IN final ( %tky = row-%tky %param = row ) ).

  ENDMETHOD.


  METHOD recalculateAllRisks.

    " Entry point for the nightly job. Reading the key list first and scoring
    " one supplier at a time keeps the memory footprint flat - a full supplier
    " base is not something you want in one internal table.
    SELECT supplier FROM zpr_sup_risk INTO TABLE @DATA(suppliers).

    DATA(changed) = 0.
    LOOP AT suppliers INTO DATA(supplier).
      IF score_and_persist( supplier-supplier ) = abap_true.
        changed += 1.
      ENDIF.
    ENDLOOP.

    result = VALUE #( ( %cid   = keys[ 1 ]-%cid
                        %param = VALUE #( evaluated = lines( suppliers )
                                          changed   = changed ) ) ).

  ENDMETHOD.


  METHOD score_and_persist.

    " One read, all indicators resolved: ZI_PR_SupplierRiskInput joins the two
    " customizing tables and the released supplier master, so the scoring class
    " receives plain numbers and stays free of any SELECT.
    SELECT SINGLE * FROM zi_pr_supplierriskinput
      WHERE Supplier = @supplier
      INTO @DATA(input).

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    DATA(assessment) = zcl_pr_risk_scoring=>assess_supplier(
      VALUE #( is_blocked              = input-IsBlocked
               financial_rating_points = input-FinancialRatingPoints
               has_financial_rating    = xsdbool( input-FinancialRatingPoints IS NOT INITIAL )
               country_risk_points     = input-CountryRiskPoints
               has_country_risk        = xsdbool( input-CountryRiskPoints IS NOT INITIAL )
               on_time_delivery_rate   = input-OnTimeDeliveryRate
               has_delivery_rate       = xsdbool( input-OnTimeDeliveryRate IS NOT INITIAL )
               quality_incidents_12m   = input-QualityIncidents12M
               iso_certified           = input-IsoCertified ) ).

    result = xsdbool( assessment-score      <> input-StoredRiskScore
                   OR assessment-risk_class <> input-StoredRiskClass ).

    CHECK result = abap_true.

    UPDATE zpr_sup_risk
      SET risk_score         = @assessment-score,
          risk_class         = @assessment-risk_class,
          risk_calculated_at = @( utclong_current( ) )
      WHERE supplier = @supplier.

  ENDMETHOD.

ENDCLASS.
