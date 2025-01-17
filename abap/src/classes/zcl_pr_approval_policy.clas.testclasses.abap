"! ABAP Unit tests for the approval policy.
"!
"! DURATION SHORT / RISK LEVEL HARMLESS: the class under test touches neither
"! the database nor any remote system, so these tests run in every transport
"! check and in the CI pipeline without a test double framework.
"!
"! They mirror cap/test/approval-policy.test.js one to one. If a threshold is
"! changed on one stack and not on the other, one of the two suites goes red.

CLASS ltcl_approval_matrix DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    CONSTANTS:
      low    TYPE zpr_req_hdr-supplier_risk_class VALUE 'A',
      medium TYPE zpr_req_hdr-supplier_risk_class VALUE 'B',
      high   TYPE zpr_req_hdr-supplier_risk_class VALUE 'C'.

    METHODS assert_levels
      IMPORTING total_value    TYPE zpr_req_hdr-total_value
                expected_low    TYPE i
                expected_medium TYPE i
                expected_high   TYPE i.

    METHODS thresholds_per_tier            FOR TESTING.
    METHODS boundaries_are_exclusive       FOR TESTING.
    METHODS unknown_risk_class_is_medium   FOR TESTING.
    METHODS riskier_is_never_cheaper       FOR TESTING.
    METHODS monotonic_in_value             FOR TESTING.
    METHODS never_exceeds_highest_level    FOR TESTING.
    METHODS chain_has_one_step_per_level   FOR TESTING.
    METHODS chain_is_capped                FOR TESTING.

ENDCLASS.


CLASS ltcl_approval_matrix IMPLEMENTATION.

  METHOD assert_levels.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>determine_required_level( total_value         = total_value
                                                              supplier_risk_class = low )
      exp = expected_low
      msg = |{ total_value } EUR at risk class A| ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>determine_required_level( total_value         = total_value
                                                              supplier_risk_class = medium )
      exp = expected_medium
      msg = |{ total_value } EUR at risk class B| ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>determine_required_level( total_value         = total_value
                                                              supplier_risk_class = high )
      exp = expected_high
      msg = |{ total_value } EUR at risk class C| ).
  ENDMETHOD.


  METHOD thresholds_per_tier.
    assert_levels( total_value = '0.00'       expected_low = 1 expected_medium = 1 expected_high = 2 ).
    assert_levels( total_value = '5000.00'    expected_low = 1 expected_medium = 2 expected_high = 2 ).
    assert_levels( total_value = '25000.00'   expected_low = 2 expected_medium = 2 expected_high = 3 ).
    assert_levels( total_value = '100000.00'  expected_low = 3 expected_medium = 3 expected_high = 3 ).
    assert_levels( total_value = '5000000.00' expected_low = 3 expected_medium = 3 expected_high = 3 ).
  ENDMETHOD.


  METHOD boundaries_are_exclusive.
    " One cent below a threshold still belongs to the cheaper tier. ABAP packed
    " numbers are exact in base 10, so unlike JavaScript this needs no trickery.
    assert_levels( total_value = '4999.99'  expected_low = 1 expected_medium = 1 expected_high = 2 ).
    assert_levels( total_value = '24999.99' expected_low = 1 expected_medium = 2 expected_high = 2 ).
    assert_levels( total_value = '99999.99' expected_low = 2 expected_medium = 2 expected_high = 3 ).
  ENDMETHOD.


  METHOD unknown_risk_class_is_medium.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>determine_required_level( total_value         = '10000.00'
                                                              supplier_risk_class = space )
      exp = zcl_pr_approval_policy=>determine_required_level( total_value         = '10000.00'
                                                              supplier_risk_class = medium )
      msg = 'An unassessed supplier must be treated as medium risk' ).
  ENDMETHOD.


  METHOD riskier_is_never_cheaper.
    LOOP AT VALUE stringtab( ( `0.00` ) ( `4999.00` ) ( `5000.00` ) ( `24999.00` )
                             ( `25000.00` ) ( `99999.00` ) ( `100000.00` ) ( `250000.00` ) )
         INTO DATA(raw).
      DATA(amount) = CONV zpr_req_hdr-total_value( raw ).
      DATA(level_a) = zcl_pr_approval_policy=>determine_required_level(
                        total_value = amount supplier_risk_class = low ).
      DATA(level_b) = zcl_pr_approval_policy=>determine_required_level(
                        total_value = amount supplier_risk_class = medium ).
      DATA(level_c) = zcl_pr_approval_policy=>determine_required_level(
                        total_value = amount supplier_risk_class = high ).

      cl_abap_unit_assert=>assert_true( xsdbool( level_b >= level_a )
                                        msg = |B must not be cheaper than A at { amount }| ).
      cl_abap_unit_assert=>assert_true( xsdbool( level_c >= level_b )
                                        msg = |C must not be cheaper than B at { amount }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD monotonic_in_value.
    LOOP AT VALUE stringtab( ( `A` ) ( `B` ) ( `C` ) ) INTO DATA(class).
      DATA(previous) = 0.
      LOOP AT VALUE stringtab( ( `0.00` ) ( `4999.00` ) ( `5000.00` ) ( `24999.00` )
                               ( `25000.00` ) ( `99999.00` ) ( `100000.00` ) ( `250000.00` ) )
           INTO DATA(raw).
        DATA(level) = zcl_pr_approval_policy=>determine_required_level(
                        total_value         = CONV #( raw )
                        supplier_risk_class = CONV #( class ) ).
        cl_abap_unit_assert=>assert_true( xsdbool( level >= previous )
                                          msg = |Level must not drop when the value grows ({ class })| ).
        previous = level.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.


  METHOD never_exceeds_highest_level.
    cl_abap_unit_assert=>assert_true(
      xsdbool( zcl_pr_approval_policy=>determine_required_level(
                 total_value         = '999999999.00'
                 supplier_risk_class = high ) <= zcl_pr_approval_policy=>max_approval_level ) ).
  ENDMETHOD.


  METHOD chain_has_one_step_per_level.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>build_approval_chain( 3 )
      exp = VALUE zcl_pr_approval_policy=>ty_levels( ( 1 ) ( 2 ) ( 3 ) ) ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>build_approval_chain( 1 )
      exp = VALUE zcl_pr_approval_policy=>ty_levels( ( 1 ) ) ).
  ENDMETHOD.


  METHOD chain_is_capped.
    cl_abap_unit_assert=>assert_equals(
      act = lines( zcl_pr_approval_policy=>build_approval_chain( 99 ) )
      exp = zcl_pr_approval_policy=>max_approval_level ).
  ENDMETHOD.

ENDCLASS.


CLASS ltcl_lifecycle DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    METHODS allowed_transitions   FOR TESTING.
    METHODS forbidden_transitions FOR TESTING.
    METHODS closed_is_a_dead_end  FOR TESTING.
    METHODS unknown_action        FOR TESTING.
    METHODS chain_arithmetic      FOR TESTING.
    METHODS role_name_convention  FOR TESTING.
ENDCLASS.


CLASS ltcl_lifecycle IMPLEMENTATION.

  METHOD allowed_transitions.
    TYPES: BEGIN OF ty_case,
             action TYPE string,
             from   TYPE zpr_req_hdr-status,
             to     TYPE zpr_req_hdr-status,
           END OF ty_case.

    DATA(cases) = VALUE STANDARD TABLE OF ty_case WITH EMPTY KEY (
      ( action = zcl_pr_approval_policy=>lifecycle_action-submit
        from = 'DR' to = 'IA' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-approve
        from = 'IA' to = 'IA' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-reject
        from = 'IA' to = 'RE' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-withdraw
        from = 'IA' to = 'DR' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-close
        from = 'AP' to = 'CL' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-reopen
        from = 'RE' to = 'DR' ) ).

    LOOP AT cases INTO DATA(case).
      cl_abap_unit_assert=>assert_equals(
        act = zcl_pr_approval_policy=>target_status( action = case-action current_status = case-from )
        exp = case-to
        msg = |{ case-action } from { case-from }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD forbidden_transitions.
    TYPES: BEGIN OF ty_case,
             action TYPE string,
             from   TYPE zpr_req_hdr-status,
           END OF ty_case.

    DATA(cases) = VALUE STANDARD TABLE OF ty_case WITH EMPTY KEY (
      ( action = zcl_pr_approval_policy=>lifecycle_action-submit   from = 'IA' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-submit   from = 'AP' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-approve  from = 'DR' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-approve  from = 'AP' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-withdraw from = 'AP' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-close    from = 'DR' )
      ( action = zcl_pr_approval_policy=>lifecycle_action-reopen   from = 'AP' ) ).

    LOOP AT cases INTO DATA(case).
      cl_abap_unit_assert=>assert_equals(
        act = zcl_pr_approval_policy=>can_perform( action = case-action current_status = case-from )
        exp = abap_false
        msg = |{ case-action } must not be allowed from { case-from }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD closed_is_a_dead_end.
    LOOP AT VALUE stringtab( ( `SUBMIT` ) ( `APPROVE` ) ( `REJECT` )
                             ( `WITHDRAW` ) ( `CLOSE` ) ( `REOPEN` ) ) INTO DATA(action).
      cl_abap_unit_assert=>assert_equals(
        act = zcl_pr_approval_policy=>can_perform(
                action         = action
                current_status = zcl_pr_approval_policy=>status-closed )
        exp = abap_false
        msg = |A closed requisition must not allow { action }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD unknown_action.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>can_perform( action = 'TELEPORT' current_status = 'DR' )
      exp = abap_false ).
  ENDMETHOD.


  METHOD chain_arithmetic.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>next_approval_level( 0 ) exp = 1 ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>is_final_approval( level = 2 required_level = 2 )
      exp = abap_true ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>is_final_approval( level = 1 required_level = 2 )
      exp = abap_false ).
  ENDMETHOD.


  METHOD role_name_convention.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>approval_role( 1 ) exp = `ZPR_APPROVER_L1` ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pr_approval_policy=>approval_role( 3 ) exp = `ZPR_APPROVER_L3` ).
  ENDMETHOD.

ENDCLASS.


CLASS ltcl_submit_validation DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    CONSTANTS today TYPE d VALUE '20260917'.

    METHODS valid_header  RETURNING VALUE(result) TYPE zcl_pr_approval_policy=>ty_requisition.
    METHODS valid_item    RETURNING VALUE(result) TYPE zcl_pr_approval_policy=>ty_item.
    METHODS funded_center RETURNING VALUE(result) TYPE zcl_pr_approval_policy=>ty_cost_center.
    METHODS contains
      IMPORTING findings      TYPE zcl_pr_approval_policy=>ty_findings
                number        TYPE symsgno
      RETURNING VALUE(result) TYPE abap_boolean.

    METHODS accepts_a_valid_requisition FOR TESTING.
    METHODS requires_at_least_one_item  FOR TESTING.
    METHODS rejects_zero_quantity       FOR TESTING.
    METHODS rejects_negative_price      FOR TESTING.
    METHODS rejects_past_delivery_date  FOR TESTING.
    METHODS accepts_delivery_today      FOR TESTING.
    METHODS rejects_blocked_supplier    FOR TESTING.
    METHODS requires_title_and_center   FOR TESTING.
    METHODS collects_every_problem      FOR TESTING.
    METHODS points_at_the_broken_field  FOR TESTING.
    METHODS rejects_over_budget         FOR TESTING.
    METHODS allows_exact_budget         FOR TESTING.
    METHODS skips_unmanaged_budget      FOR TESTING.
    METHODS single_item_rule_matches    FOR TESTING.
ENDCLASS.


CLASS ltcl_submit_validation IMPLEMENTATION.

  METHOD valid_header.
    result = VALUE #( title       = 'Steel plates'
                      requester   = 'RITA'
                      created_by  = 'RITA'
                      cost_center = '1000-4711'
                      status      = zcl_pr_approval_policy=>status-draft ).
  ENDMETHOD.


  METHOD valid_item.
    result = VALUE #( item_number      = '00010'
                      quantity         = '10.000'
                      unit_price       = '100.00'
                      net_amount       = '1000.00'
                      delivery_date    = '20261201'
                      supplier         = '4711001'
                      supplier_name    = 'Nordwind Stahl GmbH'
                      supplier_blocked = abap_false ).
  ENDMETHOD.


  METHOD funded_center.
    result = VALUE #( cost_center     = '1000-4711'
                      annual_budget   = '100000.00'
                      consumed_budget = '10000.00'
                      budget_managed  = abap_true ).
  ENDMETHOD.


  METHOD contains.
    result = xsdbool( line_exists( findings[ number = number ] ) ).
  ENDMETHOD.


  METHOD accepts_a_valid_requisition.
    cl_abap_unit_assert=>assert_initial(
      zcl_pr_approval_policy=>validate_for_submission(
        requisition = valid_header( )
        items       = VALUE #( ( valid_item( ) ) )
        cost_center = funded_center( )
        today       = today ) ).
  ENDMETHOD.


  METHOD requires_at_least_one_item.
    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-no_items ) ).
  ENDMETHOD.


  METHOD rejects_zero_quantity.
    DATA(item) = valid_item( ).
    item-quantity = 0.
    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-quantity_not_positive ) ).
  ENDMETHOD.


  METHOD rejects_negative_price.
    DATA(item) = valid_item( ).
    item-unit_price = '-1.00'.
    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-price_negative ) ).
  ENDMETHOD.


  METHOD rejects_past_delivery_date.
    DATA(item) = valid_item( ).
    item-delivery_date = '20200101'.
    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-delivery_date_in_past ) ).
  ENDMETHOD.


  METHOD accepts_delivery_today.
    DATA(item) = valid_item( ).
    item-delivery_date = today.
    cl_abap_unit_assert=>assert_false(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-delivery_date_in_past ) ).
  ENDMETHOD.


  METHOD rejects_blocked_supplier.
    DATA(item) = valid_item( ).
    item-supplier_blocked = abap_true.
    item-supplier_name = 'Kontinental Zulieferer GmbH'.
    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-supplier_blocked ) ).
  ENDMETHOD.


  METHOD requires_title_and_center.
    DATA(header) = valid_header( ).
    CLEAR: header-title, header-cost_center.

    DATA(findings) = zcl_pr_approval_policy=>validate_for_submission(
                       requisition = header
                       items       = VALUE #( ( valid_item( ) ) )
                       cost_center = VALUE #( )
                       today       = today ).

    cl_abap_unit_assert=>assert_true(
      contains( findings = findings number = zcl_pr_approval_policy=>message-title_missing ) ).
    cl_abap_unit_assert=>assert_true(
      contains( findings = findings number = zcl_pr_approval_policy=>message-cost_center_missing ) ).
  ENDMETHOD.


  METHOD collects_every_problem.
    " One round trip with five problems beats five round trips with one.
    DATA(header) = valid_header( ).
    CLEAR header-title.
    DATA(item) = valid_item( ).
    item-quantity = 0.
    item-unit_price = '-1.00'.
    item-delivery_date = '20190101'.

    DATA(findings) = zcl_pr_approval_policy=>validate_for_submission(
                       requisition = header
                       items       = VALUE #( ( item ) )
                       cost_center = funded_center( )
                       today       = today ).

    cl_abap_unit_assert=>assert_true( xsdbool( lines( findings ) >= 4 ) ).
    LOOP AT findings INTO DATA(finding).
      cl_abap_unit_assert=>assert_not_initial( finding-number ).
      cl_abap_unit_assert=>assert_not_initial( finding-text ).
    ENDLOOP.
  ENDMETHOD.


  METHOD points_at_the_broken_field.
    DATA(item) = valid_item( ).
    item-quantity = 0.

    DATA(findings) = zcl_pr_approval_policy=>validate_for_submission(
                       requisition = valid_header( )
                       items       = VALUE #( ( item ) )
                       cost_center = funded_center( )
                       today       = today ).

    cl_abap_unit_assert=>assert_equals( act = findings[ 1 ]-element exp = 'QUANTITY' ).
    cl_abap_unit_assert=>assert_equals( act = findings[ 1 ]-item_index exp = 1 ).
  ENDMETHOD.


  METHOD rejects_over_budget.
    DATA(item) = valid_item( ).
    item-net_amount = '95000.00'.

    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-budget_exceeded ) ).
  ENDMETHOD.


  METHOD allows_exact_budget.
    " Spending the remaining budget to the last cent is allowed.
    DATA(item) = valid_item( ).
    item-net_amount = '90000.00'.

    cl_abap_unit_assert=>assert_false(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = funded_center( )
                             today       = today )
                number   = zcl_pr_approval_policy=>message-budget_exceeded ) ).
  ENDMETHOD.


  METHOD single_item_rule_matches.
    " VALIDATE_ITEM is what the RAP validation VALIDATEITEM calls. It must
    " produce exactly what VALIDATE_FOR_SUBMISSION produces for that item,
    " otherwise an item could pass the save and still fail the submit.
    DATA(item) = valid_item( ).
    item-quantity = 0.
    item-delivery_date = '20200101'.

    DATA(standalone) = zcl_pr_approval_policy=>validate_item( item  = item
                                                              today = today ).

    DATA(through_submission) = zcl_pr_approval_policy=>validate_for_submission(
                                 requisition = valid_header( )
                                 items       = VALUE #( ( item ) )
                                 cost_center = funded_center( )
                                 today       = today ).

    cl_abap_unit_assert=>assert_equals( act = standalone exp = through_submission ).
    cl_abap_unit_assert=>assert_equals( act = lines( standalone ) exp = 2 ).
  ENDMETHOD.


  METHOD skips_unmanaged_budget.
    DATA(item) = valid_item( ).
    item-net_amount = '999999.00'.
    DATA(center) = funded_center( ).
    center-budget_managed = abap_false.

    cl_abap_unit_assert=>assert_false(
      contains( findings = zcl_pr_approval_policy=>validate_for_submission(
                             requisition = valid_header( )
                             items       = VALUE #( ( item ) )
                             cost_center = center
                             today       = today )
                number   = zcl_pr_approval_policy=>message-budget_exceeded ) ).
  ENDMETHOD.

ENDCLASS.


CLASS ltcl_decision_validation DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    METHODS in_approval RETURNING VALUE(result) TYPE zcl_pr_approval_policy=>ty_requisition.
    METHODS contains
      IMPORTING findings      TYPE zcl_pr_approval_policy=>ty_findings
                number        TYPE symsgno
      RETURNING VALUE(result) TYPE abap_boolean.

    METHODS accepts_entitled_approver   FOR TESTING.
    METHODS blocks_self_approval        FOR TESTING.
    METHODS blocks_creator_approval     FOR TESTING.
    METHODS blocks_missing_role         FOR TESTING.
    METHODS blocks_wrong_status         FOR TESTING.
    METHODS blocks_completed_chain      FOR TESTING.
    METHODS applies_same_rules_to_reject FOR TESTING.
ENDCLASS.


CLASS ltcl_decision_validation IMPLEMENTATION.

  METHOD in_approval.
    result = VALUE #( status                  = zcl_pr_approval_policy=>status-in_approval
                      requester               = 'RITA'
                      created_by              = 'RITA'
                      current_approval_level  = 0
                      required_approval_level = 2 ).
  ENDMETHOD.


  METHOD contains.
    result = xsdbool( line_exists( findings[ number = number ] ) ).
  ENDMETHOD.


  METHOD accepts_entitled_approver.
    cl_abap_unit_assert=>assert_initial(
      zcl_pr_approval_policy=>validate_decision(
        requisition = in_approval( )
        action      = zcl_pr_approval_policy=>lifecycle_action-approve
        user        = 'TOM'
        roles       = VALUE #( ( `ZPR_APPROVER_L1` ) ) ) ).
  ENDMETHOD.


  METHOD blocks_self_approval.
    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_decision(
                             requisition = in_approval( )
                             action      = zcl_pr_approval_policy=>lifecycle_action-approve
                             user        = 'RITA'
                             roles       = VALUE #( ( `ZPR_APPROVER_L1` ) ( `ZPR_APPROVER_L2` ) ) )
                number   = zcl_pr_approval_policy=>message-self_approval ) ).
  ENDMETHOD.


  METHOD blocks_creator_approval.
    " Even when someone else is named as requester, the creator is still out.
    DATA(requisition) = in_approval( ).
    requisition-requester = 'MONA'.

    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_decision(
                             requisition = requisition
                             action      = zcl_pr_approval_policy=>lifecycle_action-approve
                             user        = 'RITA'
                             roles       = VALUE #( ( `ZPR_APPROVER_L1` ) ) )
                number   = zcl_pr_approval_policy=>message-self_approval ) ).
  ENDMETHOD.


  METHOD blocks_missing_role.
    DATA(requisition) = in_approval( ).
    requisition-current_approval_level = 1.

    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_decision(
                             requisition = requisition
                             action      = zcl_pr_approval_policy=>lifecycle_action-approve
                             user        = 'TOM'
                             roles       = VALUE #( ( `ZPR_APPROVER_L1` ) ) )
                number   = zcl_pr_approval_policy=>message-missing_approval_role ) ).
  ENDMETHOD.


  METHOD blocks_wrong_status.
    DATA(requisition) = in_approval( ).
    requisition-status = zcl_pr_approval_policy=>status-draft.

    DATA(findings) = zcl_pr_approval_policy=>validate_decision(
                       requisition = requisition
                       action      = zcl_pr_approval_policy=>lifecycle_action-approve
                       user        = 'TOM'
                       roles       = VALUE #( ( `ZPR_APPROVER_L1` ) ) ).

    cl_abap_unit_assert=>assert_equals( act = lines( findings ) exp = 1 ).
    cl_abap_unit_assert=>assert_equals(
      act = findings[ 1 ]-number exp = zcl_pr_approval_policy=>message-invalid_transition ).
  ENDMETHOD.


  METHOD blocks_completed_chain.
    DATA(requisition) = in_approval( ).
    requisition-current_approval_level = 2.

    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_decision(
                             requisition = requisition
                             action      = zcl_pr_approval_policy=>lifecycle_action-approve
                             user        = 'CARL'
                             roles       = VALUE #( ( `ZPR_APPROVER_L1` ) ( `ZPR_APPROVER_L2` )
                                                    ( `ZPR_APPROVER_L3` ) ) )
                number   = zcl_pr_approval_policy=>message-no_pending_step ) ).
  ENDMETHOD.


  METHOD applies_same_rules_to_reject.
    cl_abap_unit_assert=>assert_true(
      contains( findings = zcl_pr_approval_policy=>validate_decision(
                             requisition = in_approval( )
                             action      = zcl_pr_approval_policy=>lifecycle_action-reject
                             user        = 'RITA'
                             roles       = VALUE #( ( `ZPR_APPROVER_L1` ) ) )
                number   = zcl_pr_approval_policy=>message-self_approval ) ).
  ENDMETHOD.

ENDCLASS.
