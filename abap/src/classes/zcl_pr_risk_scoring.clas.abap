"! <p class="shorttext synchronized">Supplier risk scoring</p>
"!
"! Produces a score from 0 (no concerns) to 100 (do not order here) and folds
"! it into the three risk classes the approval matrix works with. The score is
"! a weighted sum of five indicators:
"!
"! <ul>
"!   <li>financial rating       - 40 %, external rating agency feed</li>
"!   <li>on time delivery rate  - 25 %, purchase order history</li>
"!   <li>quality incidents 12M  - 20 %, QM notifications of type Q2/Q3</li>
"!   <li>country risk           - 10 %, OECD country risk category</li>
"!   <li>ISO 9001 certification -  5 %, supplier self disclosure</li>
"! </ul>
"!
"! The class contains no SELECT on purpose: the two customizing tables are
"! resolved by ZI_PR_SupplierRiskInput, and the caller passes the resulting
"! numbers in. Counterpart of srv/lib/risk-scoring.js on the CAP side.
CLASS zcl_pr_risk_scoring DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES ty_points TYPE p LENGTH 8 DECIMALS 4.

    TYPES:
      "! Indicators of one supplier, with the customizing already resolved.
      BEGIN OF ty_profile,
        is_blocked              TYPE abap_boolean,
        financial_rating_points TYPE i,
        has_financial_rating    TYPE abap_boolean,
        country_risk_points     TYPE i,
        has_country_risk        TYPE abap_boolean,
        on_time_delivery_rate   TYPE zpr_sup_risk-on_time_delivery_rate,
        has_delivery_rate       TYPE abap_boolean,
        quality_incidents_12m   TYPE zpr_sup_risk-quality_incidents_12m,
        iso_certified           TYPE abap_boolean,
      END OF ty_profile.

    TYPES:
      "! One line of the explanation shown next to the score.
      BEGIN OF ty_breakdown_line,
        indicator    TYPE string,
        weight       TYPE ty_points,
        points       TYPE ty_points,
        contribution TYPE ty_points,
      END OF ty_breakdown_line,
      ty_breakdown TYPE STANDARD TABLE OF ty_breakdown_line WITH EMPTY KEY.

    TYPES:
      BEGIN OF ty_assessment,
        score      TYPE zpr_sup_risk-risk_score,
        risk_class TYPE zpr_sup_risk-risk_class,
        blocked    TYPE abap_boolean,
        breakdown  TYPE ty_breakdown,
      END OF ty_assessment.

    "! Relative weight of each indicator. Must add up to 1.
    CONSTANTS:
      BEGIN OF weight,
        financial_rating TYPE ty_points VALUE '0.40',
        on_time_delivery TYPE ty_points VALUE '0.25',
        quality          TYPE ty_points VALUE '0.20',
        country_risk     TYPE ty_points VALUE '0.10',
        certification    TYPE ty_points VALUE '0.05',
      END OF weight.

    "! Upper bound (exclusive) of risk class A and B. Everything else is C.
    CONSTANTS:
      BEGIN OF threshold,
        low_upper_bound    TYPE i VALUE 25,
        medium_upper_bound TYPE i VALUE 55,
      END OF threshold.

    "! Assumptions for indicators that are not maintained yet. Deliberately
    "! pessimistic - an unknown supplier is not a good supplier.
    CONSTANTS:
      BEGIN OF default_value,
        "! Same penalty as a B rating - highly speculative.
        unrated_financial_points TYPE i VALUE 50,
        "! Slightly worse than the median OECD category.
        unknown_country_points   TYPE i VALUE 50,
        "! New suppliers have no delivery history; assume 80 % on time.
        on_time_delivery_rate    TYPE ty_points VALUE '0.8000',
      END OF default_value.

    "! Number of quality incidents that alone maxes out the quality indicator.
    CONSTANTS quality_incidents_at_max TYPE i VALUE 8.

    "! Score assigned to a supplier that carries a purchasing block.
    CONSTANTS blocked_score TYPE i VALUE 100.

    "! Calculates the weighted risk score of one supplier.
    CLASS-METHODS assess_supplier
      IMPORTING profile       TYPE ty_profile
      RETURNING VALUE(result) TYPE ty_assessment.

    "! Maps a score onto a risk class.
    CLASS-METHODS derive_risk_class
      IMPORTING score         TYPE i
      RETURNING VALUE(result) TYPE zpr_sup_risk-risk_class.

    "! Worst (highest) of a list of risk classes. A requisition inherits the
    "! worst risk class of all its item suppliers.
    CLASS-METHODS worst_risk_class
      IMPORTING risk_classes  TYPE string_table
      RETURNING VALUE(result) TYPE zpr_sup_risk-risk_class.

  PRIVATE SECTION.

    CLASS-METHODS clamp
      IMPORTING value         TYPE ty_points
                low           TYPE ty_points
                high          TYPE ty_points
      RETURNING VALUE(result) TYPE ty_points.

    CLASS-METHODS financial_points
      IMPORTING profile       TYPE ty_profile
      RETURNING VALUE(result) TYPE ty_points.

    CLASS-METHODS delivery_points
      IMPORTING profile       TYPE ty_profile
      RETURNING VALUE(result) TYPE ty_points.

    CLASS-METHODS quality_points
      IMPORTING profile       TYPE ty_profile
      RETURNING VALUE(result) TYPE ty_points.

    CLASS-METHODS country_points
      IMPORTING profile       TYPE ty_profile
      RETURNING VALUE(result) TYPE ty_points.

    CLASS-METHODS certification_points
      IMPORTING profile       TYPE ty_profile
      RETURNING VALUE(result) TYPE ty_points.

ENDCLASS.


CLASS zcl_pr_risk_scoring IMPLEMENTATION.

  METHOD assess_supplier.

    " A purchasing block overrules every other indicator. There is no score
    " good enough to make a blocked supplier orderable.
    IF profile-is_blocked = abap_true.
      result = VALUE #( score      = blocked_score
                        risk_class = 'C'
                        blocked    = abap_true
                        breakdown  = VALUE #( ( indicator    = `purchasingBlock`
                                                weight       = 1
                                                points       = blocked_score
                                                contribution = blocked_score ) ) ).
      RETURN.
    ENDIF.

    result-breakdown = VALUE #(
      ( indicator = `financialRating` weight = weight-financial_rating points = financial_points( profile ) )
      ( indicator = `onTimeDelivery`  weight = weight-on_time_delivery points = delivery_points( profile ) )
      ( indicator = `qualityIncidents` weight = weight-quality         points = quality_points( profile ) )
      ( indicator = `countryRisk`     weight = weight-country_risk     points = country_points( profile ) )
      ( indicator = `certification`   weight = weight-certification    points = certification_points( profile ) ) ).

    DATA(total) = CONV ty_points( 0 ).
    LOOP AT result-breakdown ASSIGNING FIELD-SYMBOL(<line>).
      <line>-contribution = <line>-weight * <line>-points.
      total = total + <line>-contribution.
    ENDLOOP.

    result-score      = clamp( value = total low = 0 high = 100 ).
    result-risk_class = derive_risk_class( result-score ).
    result-blocked    = abap_false.

  ENDMETHOD.


  METHOD derive_risk_class.
    result = COND #( WHEN score < threshold-low_upper_bound    THEN 'A'
                     WHEN score < threshold-medium_upper_bound THEN 'B'
                     ELSE                                           'C' ).
  ENDMETHOD.


  METHOD worst_risk_class.
    LOOP AT risk_classes INTO DATA(candidate).
      IF candidate = 'C'.
        result = 'C'.
        RETURN.
      ELSEIF candidate = 'B'.
        result = 'B'.
      ELSEIF candidate = 'A' AND result IS INITIAL.
        result = 'A'.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD clamp.
    result = COND #( WHEN value < low  THEN low
                     WHEN value > high THEN high
                     ELSE                   value ).
  ENDMETHOD.


  METHOD financial_points.
    result = COND #( WHEN profile-has_financial_rating = abap_true
                     THEN clamp( value = CONV #( profile-financial_rating_points ) low = 0 high = 100 )
                     ELSE default_value-unrated_financial_points ).
  ENDMETHOD.


  METHOD delivery_points.
    DATA(rate) = COND ty_points(
      WHEN profile-has_delivery_rate = abap_true
      THEN clamp( value = CONV #( profile-on_time_delivery_rate ) low = 0 high = 1 )
      ELSE default_value-on_time_delivery_rate ).
    result = ( 1 - rate ) * 100.
  ENDMETHOD.


  METHOD quality_points.
    DATA(incidents) = COND ty_points( WHEN profile-quality_incidents_12m > 0
                                      THEN profile-quality_incidents_12m
                                      ELSE 0 ).
    result = clamp( value = incidents / quality_incidents_at_max * 100 low = 0 high = 100 ).
  ENDMETHOD.


  METHOD country_points.
    result = COND #( WHEN profile-has_country_risk = abap_true
                     THEN clamp( value = CONV #( profile-country_risk_points ) low = 0 high = 100 )
                     ELSE default_value-unknown_country_points ).
  ENDMETHOD.


  METHOD certification_points.
    result = COND #( WHEN profile-iso_certified = abap_true THEN 0 ELSE 100 ).
  ENDMETHOD.

ENDCLASS.
