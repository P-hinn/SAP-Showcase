"! <p class="shorttext synchronized">Approval policy for purchase requisitions</p>
"!
"! Holds three things and nothing else:
"! <ol>
"!   <li>the approval matrix - how many signatures a requisition needs,</li>
"!   <li>the lifecycle state machine - which action is allowed in which status,</li>
"!   <li>the submit time validations.</li>
"! </ol>
"!
"! The class is free of any SELECT and of any RAP artefact. Callers pass plain
"! structures in and receive plain findings back, which the behaviour pool turns
"! into entries of REPORTED. That is what makes the rules unit testable without
"! a database, and it is the direct counterpart of srv/lib/approval-policy.js
"! on the CAP side - same thresholds, same message numbers.
CLASS zcl_pr_approval_policy DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    "! Lifecycle status codes.
    CONSTANTS:
      BEGIN OF status,
        draft       TYPE zpr_req_hdr-status VALUE 'DR',
        in_approval TYPE zpr_req_hdr-status VALUE 'IA',
        approved    TYPE zpr_req_hdr-status VALUE 'AP',
        rejected    TYPE zpr_req_hdr-status VALUE 'RE',
        closed      TYPE zpr_req_hdr-status VALUE 'CL',
      END OF status.

    "! Decision codes of a single approval step.
    CONSTANTS:
      BEGIN OF decision,
        pending  TYPE zpr_approval-decision VALUE 'PEND',
        approved TYPE zpr_approval-decision VALUE 'APPR',
        rejected TYPE zpr_approval-decision VALUE 'REJE',
        skipped  TYPE zpr_approval-decision VALUE 'SKIP',
      END OF decision.

    "! Supplier risk classes.
    CONSTANTS:
      BEGIN OF risk_class,
        low    TYPE zpr_req_hdr-supplier_risk_class VALUE 'A',
        medium TYPE zpr_req_hdr-supplier_risk_class VALUE 'B',
        high   TYPE zpr_req_hdr-supplier_risk_class VALUE 'C',
      END OF risk_class.

    "! Action names of the state machine.
    CONSTANTS:
      BEGIN OF lifecycle_action,
        submit   TYPE string VALUE 'SUBMIT',
        approve  TYPE string VALUE 'APPROVE',
        reject   TYPE string VALUE 'REJECT',
        withdraw TYPE string VALUE 'WITHDRAW',
        close    TYPE string VALUE 'CLOSE',
        reopen   TYPE string VALUE 'REOPEN',
      END OF lifecycle_action.

    "! Message numbers of message class ZPR_MSG. Identical to the codes the
    "! CAP implementation returns, so both stacks quote the same number.
    CONSTANTS:
      BEGIN OF message,
        no_items              TYPE symsgno VALUE '001',
        quantity_not_positive TYPE symsgno VALUE '002',
        price_negative        TYPE symsgno VALUE '003',
        delivery_date_in_past TYPE symsgno VALUE '004',
        supplier_blocked      TYPE symsgno VALUE '005',
        budget_exceeded       TYPE symsgno VALUE '006',
        title_missing         TYPE symsgno VALUE '007',
        self_approval         TYPE symsgno VALUE '008',
        invalid_transition    TYPE symsgno VALUE '009',
        missing_approval_role TYPE symsgno VALUE '010',
        no_pending_step       TYPE symsgno VALUE '011',
        cost_center_missing   TYPE symsgno VALUE '012',
      END OF message.

    "! Highest approval level that exists.
    CONSTANTS max_approval_level TYPE i VALUE 3.

    TYPES:
      "! One rule violation. `element` carries the field the message points at,
      "! so the Fiori UI can mark it.
      BEGIN OF ty_finding,
        number     TYPE symsgno,
        text       TYPE string,
        element    TYPE string,
        item_index TYPE i,
      END OF ty_finding,
      ty_findings TYPE STANDARD TABLE OF ty_finding WITH EMPTY KEY.

    TYPES:
      "! Header fields the rules look at.
      BEGIN OF ty_requisition,
        title                   TYPE zpr_req_hdr-title,
        requester               TYPE zpr_req_hdr-requester,
        created_by              TYPE zpr_req_hdr-created_by,
        cost_center             TYPE zpr_req_hdr-cost_center,
        status                  TYPE zpr_req_hdr-status,
        current_approval_level  TYPE zpr_req_hdr-current_approval_level,
        required_approval_level TYPE zpr_req_hdr-required_approval_level,
      END OF ty_requisition.

    TYPES:
      "! Item fields the rules look at, with the supplier already resolved.
      BEGIN OF ty_item,
        item_number      TYPE zpr_req_itm-item_number,
        quantity         TYPE zpr_req_itm-quantity,
        unit_price       TYPE zpr_req_itm-unit_price,
        net_amount       TYPE zpr_req_itm-net_amount,
        delivery_date    TYPE zpr_req_itm-delivery_date,
        supplier         TYPE zpr_req_itm-supplier,
        supplier_name    TYPE string,
        supplier_blocked TYPE abap_boolean,
      END OF ty_item,
      ty_items TYPE STANDARD TABLE OF ty_item WITH EMPTY KEY.

    TYPES:
      "! Budget figures of the cost center the requisition is booked on.
      BEGIN OF ty_cost_center,
        cost_center     TYPE zpr_req_hdr-cost_center,
        annual_budget   TYPE zpr_req_hdr-total_value,
        consumed_budget TYPE zpr_req_hdr-total_value,
        budget_managed  TYPE abap_boolean,
      END OF ty_cost_center.

    TYPES ty_levels TYPE STANDARD TABLE OF i WITH EMPTY KEY.
    TYPES ty_roles  TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    "! Determines how many approval levels a requisition needs.
    "! @parameter total_value | net value of the requisition
    "! @parameter supplier_risk_class | worst risk class over all items
    "! @parameter result | 1, 2 or 3
    CLASS-METHODS determine_required_level
      IMPORTING total_value         TYPE zpr_req_hdr-total_value
                supplier_risk_class TYPE zpr_req_hdr-supplier_risk_class
      RETURNING VALUE(result)       TYPE i.

    "! Builds the full approval chain: one level from 1 up to the required one.
    CLASS-METHODS build_approval_chain
      IMPORTING required_level TYPE i
      RETURNING VALUE(result)  TYPE ty_levels.

    "! True if `action` is allowed in `current_status`.
    CLASS-METHODS can_perform
      IMPORTING action         TYPE string
                current_status TYPE zpr_req_hdr-status
      RETURNING VALUE(result)  TYPE abap_boolean.

    "! Target status after `action`, or SPACE if the transition is forbidden.
    CLASS-METHODS target_status
      IMPORTING action         TYPE string
                current_status TYPE zpr_req_hdr-status
      RETURNING VALUE(result)  TYPE zpr_req_hdr-status.

    "! The level that has to sign off next.
    CLASS-METHODS next_approval_level
      IMPORTING current_approval_level TYPE zpr_req_hdr-current_approval_level
      RETURNING VALUE(result)          TYPE i.

    "! True if approving `level` completes the chain.
    CLASS-METHODS is_final_approval
      IMPORTING level          TYPE i
                required_level TYPE i
      RETURNING VALUE(result)  TYPE abap_boolean.

    "! Name of the authorisation role required for an approval level.
    CLASS-METHODS approval_role
      IMPORTING level         TYPE i
      RETURNING VALUE(result) TYPE string.

    "! Validates a requisition before it is submitted.
    "! Collects every problem instead of failing on the first one.
    CLASS-METHODS validate_for_submission
      IMPORTING requisition   TYPE ty_requisition
                items         TYPE ty_items
                cost_center   TYPE ty_cost_center
                today         TYPE d
      RETURNING VALUE(result) TYPE ty_findings.

    "! Validates one item on its own.
    "! Called per item by VALIDATE_FOR_SUBMISSION and directly by the RAP
    "! validation VALIDATEITEM, so an item is checked by the same code whether
    "! it is saved on its own or as part of a submit.
    CLASS-METHODS validate_item
      IMPORTING item          TYPE ty_item
                item_index    TYPE i DEFAULT 1
                today         TYPE d
      RETURNING VALUE(result) TYPE ty_findings.

    "! Validates an approval or rejection.
    CLASS-METHODS validate_decision
      IMPORTING requisition   TYPE ty_requisition
                action        TYPE string
                user          TYPE syuname
                roles         TYPE ty_roles
      RETURNING VALUE(result) TYPE ty_findings.

  PRIVATE SECTION.

    TYPES:
      "! One tier of the approval matrix. `max_value` is exclusive.
      BEGIN OF ty_matrix_row,
        max_value    TYPE zpr_req_hdr-total_value,
        level_low    TYPE i,
        level_medium TYPE i,
        level_high   TYPE i,
      END OF ty_matrix_row,
      ty_matrix TYPE STANDARD TABLE OF ty_matrix_row WITH EMPTY KEY.

    "! The approval matrix. Changing a number here changes both the runtime
    "! behaviour and the table in docs/business-rules.md.
    "!
    "! Read as: up to `max_value` EUR net (exclusive), a supplier of the given
    "! risk class requires approval up to the level in that column. Anything
    "! above the last tier needs the highest level that exists.
    CLASS-METHODS approval_matrix
      RETURNING VALUE(result) TYPE ty_matrix.

ENDCLASS.


CLASS zcl_pr_approval_policy IMPLEMENTATION.

  METHOD approval_matrix.
    result = VALUE #(
      ( max_value = '5000.00'   level_low = 1  level_medium = 1  level_high = 2 )
      ( max_value = '25000.00'  level_low = 1  level_medium = 2  level_high = 2 )
      ( max_value = '100000.00' level_low = 2  level_medium = 2  level_high = 3 ) ).
  ENDMETHOD.


  METHOD determine_required_level.

    " An unassessed supplier must not be cheaper to approve than an assessed
    " one, so an unknown risk class counts as medium.
    DATA(effective_class) = COND #(
      WHEN supplier_risk_class = risk_class-low
        OR supplier_risk_class = risk_class-medium
        OR supplier_risk_class = risk_class-high
      THEN supplier_risk_class
      ELSE risk_class-medium ).

    LOOP AT approval_matrix( ) INTO DATA(tier).
      IF total_value < tier-max_value.
        result = SWITCH #( effective_class
                   WHEN risk_class-low    THEN tier-level_low
                   WHEN risk_class-medium THEN tier-level_medium
                   WHEN risk_class-high   THEN tier-level_high ).
        RETURN.
      ENDIF.
    ENDLOOP.

    " Above the last tier every risk class needs the highest level.
    result = max_approval_level.

  ENDMETHOD.


  METHOD build_approval_chain.
    DATA(highest) = COND i( WHEN required_level > max_approval_level
                            THEN max_approval_level
                            ELSE required_level ).
    DO highest TIMES.
      APPEND sy-index TO result.
    ENDDO.
  ENDMETHOD.


  METHOD can_perform.
    result = xsdbool( target_status( action         = action
                                     current_status = current_status ) IS NOT INITIAL ).
  ENDMETHOD.


  METHOD target_status.

    result = SWITCH #( action
      WHEN lifecycle_action-submit THEN
        COND #( WHEN current_status = status-draft THEN status-in_approval )
      WHEN lifecycle_action-approve THEN
        COND #( WHEN current_status = status-in_approval THEN status-in_approval )
      WHEN lifecycle_action-reject THEN
        COND #( WHEN current_status = status-in_approval THEN status-rejected )
      WHEN lifecycle_action-withdraw THEN
        COND #( WHEN current_status = status-in_approval THEN status-draft )
      WHEN lifecycle_action-close THEN
        COND #( WHEN current_status = status-approved THEN status-closed )
      WHEN lifecycle_action-reopen THEN
        COND #( WHEN current_status = status-rejected THEN status-draft ) ).

  ENDMETHOD.


  METHOD next_approval_level.
    result = current_approval_level + 1.
  ENDMETHOD.


  METHOD is_final_approval.
    result = xsdbool( level >= required_level ).
  ENDMETHOD.


  METHOD approval_role.
    result = |ZPR_APPROVER_L{ level }|.
  ENDMETHOD.


  METHOD validate_for_submission.

    IF requisition-title IS INITIAL.
      APPEND VALUE #( number  = message-title_missing
                      text    = 'Enter a title for the requisition.'
                      element = 'TITLE' ) TO result.
    ENDIF.

    IF requisition-cost_center IS INITIAL.
      APPEND VALUE #( number  = message-cost_center_missing
                      text    = 'Assign a cost center before submitting.'
                      element = 'COSTCENTER' ) TO result.
    ENDIF.

    IF items IS INITIAL.
      APPEND VALUE #( number = message-no_items
                      text   = 'A requisition must contain at least one item.' ) TO result.
    ENDIF.

    LOOP AT items INTO DATA(item).
      APPEND LINES OF validate_item( item       = item
                                     item_index = sy-tabix
                                     today      = today ) TO result.
    ENDLOOP.

    IF cost_center-budget_managed = abap_true.
      DATA(requested) = REDUCE zpr_req_hdr-total_value(
                          INIT sum = CONV zpr_req_hdr-total_value( 0 )
                          FOR entry IN items
                          NEXT sum = sum + entry-net_amount ).
      DATA(remaining) = cost_center-annual_budget - cost_center-consumed_budget.

      IF requested > remaining.
        APPEND VALUE #( number  = message-budget_exceeded
                        text    = |Cost center { cost_center-cost_center } has { remaining } left, | &&
                                  |the requisition asks for { requested }.|
                        element = 'COSTCENTER' ) TO result.
      ENDIF.
    ENDIF.

  ENDMETHOD.


  METHOD validate_item.

    DATA(label) = COND string( WHEN item-item_number IS NOT INITIAL
                               THEN |{ item-item_number ALPHA = OUT }|
                               ELSE |{ item_index * 10 }| ).

    IF item-quantity <= 0.
      APPEND VALUE #( number     = message-quantity_not_positive
                      text       = |Item { label }: enter a quantity greater than zero.|
                      element    = 'QUANTITY'
                      item_index = item_index ) TO result.
    ENDIF.

    IF item-unit_price < 0.
      APPEND VALUE #( number     = message-price_negative
                      text       = |Item { label }: the unit price must not be negative.|
                      element    = 'UNITPRICE'
                      item_index = item_index ) TO result.
    ENDIF.

    IF item-delivery_date IS INITIAL OR item-delivery_date < today.
      APPEND VALUE #( number     = message-delivery_date_in_past
                      text       = |Item { label }: the delivery date must not be in the past.|
                      element    = 'DELIVERYDATE'
                      item_index = item_index ) TO result.
    ENDIF.

    IF item-supplier_blocked = abap_true.
      APPEND VALUE #( number     = message-supplier_blocked
                      text       = |Item { label }: supplier { item-supplier_name } carries a purchasing block.|
                      element    = 'SUPPLIER'
                      item_index = item_index ) TO result.
    ENDIF.

  ENDMETHOD.


  METHOD validate_decision.

    IF can_perform( action = action current_status = requisition-status ) = abap_false.
      APPEND VALUE #( number = message-invalid_transition
                      text   = |Action { action } is not allowed for a requisition | &&
                               |in status { requisition-status }.| ) TO result.
      " Everything below assumes a requisition that can be decided on.
      RETURN.
    ENDIF.

    " Separation of duties. Nobody signs off their own demand, no matter which
    " roles they hold - this is the rule an auditor looks for first.
    IF requisition-requester = user OR requisition-created_by = user.
      APPEND VALUE #( number = message-self_approval
                      text   = 'You cannot decide on a requisition you raised yourself.' ) TO result.
    ENDIF.

    DATA(level) = next_approval_level( requisition-current_approval_level ).

    IF level > requisition-required_approval_level.
      APPEND VALUE #( number = message-no_pending_step
                      text   = 'The approval chain of this requisition is already complete.' ) TO result.
      RETURN.
    ENDIF.

    DATA(required_role) = approval_role( level ).
    IF NOT line_exists( roles[ table_line = required_role ] ).
      APPEND VALUE #( number = message-missing_approval_role
                      text   = |Approval level { level } requires the role { required_role }.| ) TO result.
    ENDIF.

  ENDMETHOD.

ENDCLASS.
