"! ABAP Unit tests for the supplier risk scoring.
"!
"! Mirrors cap/test/risk-scoring.test.js. Both suites assert the same weights,
"! the same thresholds and the same treatment of missing data, so a rule that
"! is changed on one stack only cannot pass both builds.

CLASS ltcl_risk_scoring DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.

    "! A supplier with no concerns at all - the baseline for the weight tests.
    METHODS flawless RETURNING VALUE(result) TYPE zcl_pr_risk_scoring=>ty_profile.

    METHODS weights_add_up_to_one          FOR TESTING.
    METHODS flawless_supplier_scores_zero  FOR TESTING.
    METHODS worst_case_scores_hundred      FOR TESTING.
    METHODS financial_weight               FOR TESTING.
    METHODS delivery_weight                FOR TESTING.
    METHODS quality_weight                 FOR TESTING.
    METHODS country_weight                 FOR TESTING.
    METHODS certification_weight           FOR TESTING.
    METHODS quality_indicator_is_capped    FOR TESTING.
    METHODS unrated_is_treated_as_b        FOR TESTING.
    METHODS missing_data_is_never_better   FOR TESTING.
    METHODS block_overrules_everything     FOR TESTING.
    METHODS class_boundaries               FOR TESTING.
    METHODS breakdown_explains_the_score   FOR TESTING.
    METHODS worst_class_of_a_document      FOR TESTING.
    METHODS worst_class_of_nothing         FOR TESTING.

ENDCLASS.


CLASS ltcl_risk_scoring IMPLEMENTATION.

  METHOD flawless.
    result = VALUE #( financial_rating_points = 0
                      has_financial_rating    = abap_true
                      country_risk_points     = 0
                      has_country_risk        = abap_true
                      on_time_delivery_rate   = '1.0000'
                      has_delivery_rate       = abap_true
                      quality_incidents_12m   = 0
                      iso_certified           = abap_true ).
  ENDMETHOD.


  METHOD weights_add_up_to_one.
    DATA(total) = zcl_pr_risk_scoring=>weight-financial_rating
                + zcl_pr_risk_scoring=>weight-on_time_delivery
                + zcl_pr_risk_scoring=>weight-quality
                + zcl_pr_risk_scoring=>weight-country_risk
                + zcl_pr_risk_scoring=>weight-certification.

    cl_abap_unit_assert=>assert_equals(
      act = total
      exp = CONV zcl_pr_risk_scoring=>ty_points( 1 )
      msg = 'The indicator weights must add up to exactly 1' ).
  ENDMETHOD.


  METHOD flawless_supplier_scores_zero.
    DATA(assessment) = zcl_pr_risk_scoring=>assess_supplier( flawless( ) ).

    cl_abap_unit_assert=>assert_equals( act = assessment-score exp = 0 ).
    cl_abap_unit_assert=>assert_equals( act = assessment-risk_class exp = 'A' ).
    cl_abap_unit_assert=>assert_equals( act = assessment-blocked exp = abap_false ).
  ENDMETHOD.


  METHOD worst_case_scores_hundred.
    DATA(profile) = VALUE zcl_pr_risk_scoring=>ty_profile(
      financial_rating_points = 100 has_financial_rating = abap_true
      country_risk_points     = 100 has_country_risk     = abap_true
      on_time_delivery_rate   = '0.0000' has_delivery_rate = abap_true
      quality_incidents_12m   = 20
      iso_certified           = abap_false ).

    DATA(assessment) = zcl_pr_risk_scoring=>assess_supplier( profile ).

    cl_abap_unit_assert=>assert_equals( act = assessment-score exp = 100 ).
    cl_abap_unit_assert=>assert_equals( act = assessment-risk_class exp = 'C' ).
  ENDMETHOD.


  METHOD financial_weight.
    DATA(profile) = flawless( ).
    profile-financial_rating_points = 100.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>assess_supplier( profile )-score exp = 40 ).
  ENDMETHOD.


  METHOD delivery_weight.
    DATA(profile) = flawless( ).
    profile-on_time_delivery_rate = '0.0000'.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>assess_supplier( profile )-score exp = 25 ).
  ENDMETHOD.


  METHOD quality_weight.
    DATA(profile) = flawless( ).
    profile-quality_incidents_12m = zcl_pr_risk_scoring=>quality_incidents_at_max.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>assess_supplier( profile )-score exp = 20 ).
  ENDMETHOD.


  METHOD country_weight.
    DATA(profile) = flawless( ).
    profile-country_risk_points = 100.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>assess_supplier( profile )-score exp = 10 ).
  ENDMETHOD.


  METHOD certification_weight.
    DATA(profile) = flawless( ).
    profile-iso_certified = abap_false.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>assess_supplier( profile )-score exp = 5 ).
  ENDMETHOD.


  METHOD quality_indicator_is_capped.
    DATA(at_max) = flawless( ).
    at_max-quality_incidents_12m = zcl_pr_risk_scoring=>quality_incidents_at_max.

    DATA(way_over) = flawless( ).
    way_over-quality_incidents_12m = 500.

    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>assess_supplier( way_over )-score
      exp = zcl_pr_risk_scoring=>assess_supplier( at_max )-score
      msg = 'Beyond the cap, more incidents must not make the score worse' ).
  ENDMETHOD.


  METHOD unrated_is_treated_as_b.
    DATA(unrated) = flawless( ).
    unrated-has_financial_rating = abap_false.
    CLEAR unrated-financial_rating_points.

    DATA(rated_b) = flawless( ).
    rated_b-financial_rating_points = zcl_pr_risk_scoring=>default_value-unrated_financial_points.

    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>assess_supplier( unrated )-score
      exp = zcl_pr_risk_scoring=>assess_supplier( rated_b )-score ).
  ENDMETHOD.


  METHOD missing_data_is_never_better.
    DATA(empty) = VALUE zcl_pr_risk_scoring=>ty_profile( ).

    cl_abap_unit_assert=>assert_true(
      xsdbool( zcl_pr_risk_scoring=>assess_supplier( empty )-score
               > zcl_pr_risk_scoring=>assess_supplier( flawless( ) )-score )
      msg = 'An incomplete profile must never score better than a complete one' ).
  ENDMETHOD.


  METHOD block_overrules_everything.
    DATA(profile) = flawless( ).
    profile-is_blocked = abap_true.

    DATA(assessment) = zcl_pr_risk_scoring=>assess_supplier( profile ).

    cl_abap_unit_assert=>assert_equals( act = assessment-score exp = zcl_pr_risk_scoring=>blocked_score ).
    cl_abap_unit_assert=>assert_equals( act = assessment-risk_class exp = 'C' ).
    cl_abap_unit_assert=>assert_equals( act = assessment-blocked exp = abap_true ).
  ENDMETHOD.


  METHOD class_boundaries.
    TYPES: BEGIN OF ty_case,
             score TYPE i,
             class TYPE zpr_sup_risk-risk_class,
           END OF ty_case.

    DATA(cases) = VALUE STANDARD TABLE OF ty_case WITH EMPTY KEY (
      ( score = 0   class = 'A' ) ( score = 24  class = 'A' )
      ( score = 25  class = 'B' ) ( score = 54  class = 'B' )
      ( score = 55  class = 'C' ) ( score = 100 class = 'C' ) ).

    LOOP AT cases INTO DATA(case).
      cl_abap_unit_assert=>assert_equals(
        act = zcl_pr_risk_scoring=>derive_risk_class( case-score )
        exp = case-class
        msg = |Score { case-score }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD breakdown_explains_the_score.
    DATA(profile) = flawless( ).
    profile-financial_rating_points = 100.

    DATA(assessment) = zcl_pr_risk_scoring=>assess_supplier( profile ).
    DATA(financial) = assessment-breakdown[ indicator = `financialRating` ].

    cl_abap_unit_assert=>assert_equals( act = financial-points exp = CONV zcl_pr_risk_scoring=>ty_points( 100 ) ).
    cl_abap_unit_assert=>assert_equals( act = financial-contribution exp = CONV zcl_pr_risk_scoring=>ty_points( 40 ) ).

    DATA(sum) = REDUCE zcl_pr_risk_scoring=>ty_points(
                  INIT total = CONV zcl_pr_risk_scoring=>ty_points( 0 )
                  FOR entry IN assessment-breakdown
                  NEXT total = total + entry-contribution ).

    cl_abap_unit_assert=>assert_equals(
      act = CONV i( sum )
      exp = assessment-score
      msg = 'The breakdown must add up to the score it explains' ).
  ENDMETHOD.


  METHOD worst_class_of_a_document.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>worst_risk_class( VALUE #( ( `A` ) ( `B` ) ( `C` ) ) ) exp = 'C' ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>worst_risk_class( VALUE #( ( `A` ) ( `A` ) ) ) exp = 'A' ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_risk_scoring=>worst_risk_class( VALUE #( ( `B` ) ( `A` ) ) ) exp = 'B' ).
  ENDMETHOD.


  METHOD worst_class_of_nothing.
    cl_abap_unit_assert=>assert_initial( zcl_pr_risk_scoring=>worst_risk_class( VALUE #( ) ) ).
  ENDMETHOD.

ENDCLASS.
