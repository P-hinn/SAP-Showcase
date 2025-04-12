*"* Local handler classes of the purchase requisition behaviour pool.
*"*
*"* Structure:
*"*   lhc_requisition - header: feature control, status transitions, actions
*"*   lhc_item        - items: determinations and validations
*"*   lcl_services    - shared reads and the header recalculation, so both
*"*                     handlers derive the same numbers from the same data
*"*
*"* The handlers contain no business rules. They read, they call
*"* ZCL_PR_APPROVAL_POLICY or ZCL_PR_RISK_SCORING, they write. Everything that
*"* could be argued about in a workshop lives in those two classes, where it is
*"* covered by ABAP Unit without a database.

CLASS lcl_services DEFINITION CREATE PRIVATE.

  PUBLIC SECTION.

    CLASS-METHODS get_instance RETURNING VALUE(result) TYPE REF TO lcl_services.

    "! Reads the items of one requisition and resolves the supplier attributes
    "! the validations need.
    METHODS read_items
      IMPORTING requisition_uuid TYPE zpr_req_hdr-requisition_uuid
      RETURNING VALUE(result)    TYPE zcl_pr_approval_policy=>ty_items.

    "! Reads the budget figures of a cost center.
    METHODS read_cost_center
      IMPORTING cost_center   TYPE zpr_req_hdr-cost_center
      RETURNING VALUE(result) TYPE zcl_pr_approval_policy=>ty_cost_center.

    "! Risk class of every supplier used in a requisition.
    METHODS read_supplier_risk_classes
      IMPORTING requisition_uuid TYPE zpr_req_hdr-requisition_uuid
      RETURNING VALUE(result)    TYPE string_table.

    "! The approval roles the current user actually holds.
    METHODS current_user_roles
      RETURNING VALUE(result) TYPE zcl_pr_approval_policy=>ty_roles.

    "! Recomputes total value, risk class and required approval level of one
    "! requisition from its items, and renumbers the items 10, 20, 30 ...
    "!
    "! Called from the item determination (where the trigger is) and again from
    "! SUBMIT (which must not trust whatever the header happens to carry).
    METHODS recalculate_header
      IMPORTING requisition_uuid TYPE zpr_req_hdr-requisition_uuid.

  PRIVATE SECTION.
    CLASS-DATA singleton TYPE REF TO lcl_services.
ENDCLASS.


CLASS lcl_services IMPLEMENTATION.

  METHOD get_instance.
    IF singleton IS NOT BOUND.
      singleton = NEW #( ).
    ENDIF.
    result = singleton.
  ENDMETHOD.


  METHOD read_items.
    " One statement, one join: the purchasing block lives in the released
    " standard view behind ZI_PR_Supplier, not in a replicated table.
    SELECT item~item_number,
           item~quantity,
           item~unit_price,
           item~net_amount,
           item~delivery_date,
           item~supplier,
           supplier~SupplierName    AS supplier_name,
           supplier~PostingIsBlocked AS supplier_blocked
      FROM zpr_req_itm AS item
      LEFT OUTER JOIN zi_pr_supplier AS supplier
        ON supplier~Supplier = item~supplier
      WHERE item~requisition_uuid = @requisition_uuid
      ORDER BY item~item_number
      INTO CORRESPONDING FIELDS OF TABLE @result.
  ENDMETHOD.


  METHOD read_cost_center.
    " In a productive landscape the consumed budget comes from ACDOCA through
    " a released CDS view. ZPR_COSTCTR stands in for it in this demo package.
    SELECT SINGLE cost_center, annual_budget, consumed_budget
      FROM zpr_costctr
      WHERE cost_center = @cost_center
      INTO CORRESPONDING FIELDS OF @result.

    result-budget_managed = xsdbool( sy-subrc = 0 AND result-annual_budget IS NOT INITIAL ).
  ENDMETHOD.


  METHOD read_supplier_risk_classes.
    SELECT DISTINCT supplier~RiskClass
      FROM zpr_req_itm AS item
      INNER JOIN zi_pr_supplier AS supplier
        ON supplier~Supplier = item~supplier
      WHERE item~requisition_uuid = @requisition_uuid
      INTO TABLE @result.
  ENDMETHOD.


  METHOD recalculate_header.

    " Item numbers follow the SAP convention 10, 20, 30 ...
    SELECT item_uuid
      FROM zpr_req_itm
      WHERE requisition_uuid = @requisition_uuid
      ORDER BY created_at, item_uuid
      INTO TABLE @DATA(ordered).

    LOOP AT ordered INTO DATA(row).
      UPDATE zpr_req_itm
        SET item_number = @( CONV zpr_req_itm-item_number( sy-tabix * 10 ) )
        WHERE item_uuid = @row-item_uuid.
    ENDLOOP.

    SELECT SUM( net_amount ) AS total
      FROM zpr_req_itm
      WHERE requisition_uuid = @requisition_uuid
      INTO @DATA(total_value).

    DATA(risk_class) = zcl_pr_risk_scoring=>worst_risk_class(
                         read_supplier_risk_classes( requisition_uuid ) ).

    DATA(required_level) = zcl_pr_approval_policy=>determine_required_level(
                             total_value         = total_value
                             supplier_risk_class = risk_class ).

    UPDATE zpr_req_hdr
      SET total_value             = @total_value,
          supplier_risk_class     = @risk_class,
          required_approval_level = @required_level
      WHERE requisition_uuid = @requisition_uuid.

  ENDMETHOD.


  METHOD current_user_roles.
    " Authorisation objects are the source of truth, not a role name table.
    DO zcl_pr_approval_policy=>max_approval_level TIMES.
      DATA(level) = sy-index.
      AUTHORITY-CHECK OBJECT 'ZPR_APPR'
        ID 'ZPR_LEVEL' FIELD level
        ID 'ACTVT'     FIELD '02'.
      IF sy-subrc = 0.
        APPEND zcl_pr_approval_policy=>approval_role( level ) TO result.
      ENDIF.
    ENDDO.
  ENDMETHOD.

ENDCLASS.


CLASS lhc_requisition DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.

    METHODS get_instance_features FOR INSTANCE FEATURES
      IMPORTING keys REQUEST requested_features FOR Requisition RESULT result.

    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR Requisition RESULT result.

    METHODS setInitialValues FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Requisition~setInitialValues.

    METHODS validateHeader FOR VALIDATE ON SAVE
      IMPORTING keys FOR Requisition~validateHeader.

    METHODS submit FOR MODIFY
      IMPORTING keys FOR ACTION Requisition~submit RESULT result.

    METHODS approve FOR MODIFY
      IMPORTING keys FOR ACTION Requisition~approve RESULT result.

    METHODS rejectRequisition FOR MODIFY
      IMPORTING keys FOR ACTION Requisition~rejectRequisition RESULT result.

    METHODS withdraw FOR MODIFY
      IMPORTING keys FOR ACTION Requisition~withdraw RESULT result.

    METHODS close FOR MODIFY
      IMPORTING keys FOR ACTION Requisition~close RESULT result.

    METHODS reopen FOR MODIFY
      IMPORTING keys FOR ACTION Requisition~reopen RESULT result.

    METHODS copyRequisition FOR MODIFY
      IMPORTING keys FOR ACTION Requisition~copyRequisition.

    "! Shared implementation of `approve` and `rejectRequisition` - the two
    "! differ in three lines, and duplicating the guard clauses would be the
    "! place where they drift apart. Typed on the parameterless `withdraw`
    "! import structure, because the two parameter structures differ and the
    "! decision itself only needs the key and the comment.
    METHODS decide
      IMPORTING requisition TYPE STRUCTURE FOR READ RESULT zi_pr_requisition
                action      TYPE string
                comment     TYPE string
      CHANGING  reported    TYPE RESPONSE FOR REPORTED LATE zi_pr_requisition.

    "! Next document number for the current year.
    METHODS next_requisition_number
      RETURNING VALUE(result) TYPE zpr_req_hdr-requisition_number.

    "! Turns policy findings into RAP messages.
    METHODS report_findings
      IMPORTING requisition TYPE STRUCTURE FOR READ RESULT zi_pr_requisition
                findings    TYPE zcl_pr_approval_policy=>ty_findings
      CHANGING  reported    TYPE RESPONSE FOR REPORTED LATE zi_pr_requisition.

ENDCLASS.


CLASS lhc_requisition IMPLEMENTATION.

  METHOD get_instance_features.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        FIELDS ( Status CurrentApprovalLevel )
        WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions)
      FAILED failed.

    result = VALUE #( FOR requisition IN requisitions
      ( %tky = requisition-%tky

        " One rule, evaluated twice: here for the button state and again in the
        " action itself. The action is the one that counts - feature control is
        " a convenience for the UI, never a security boundary.
        %action-submit = COND #(
          WHEN zcl_pr_approval_policy=>can_perform(
                 action         = zcl_pr_approval_policy=>lifecycle_action-submit
                 current_status = requisition-Status ) = abap_true
          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled )

        %action-approve = COND #(
          WHEN zcl_pr_approval_policy=>can_perform(
                 action         = zcl_pr_approval_policy=>lifecycle_action-approve
                 current_status = requisition-Status ) = abap_true
          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled )

        %action-rejectRequisition = COND #(
          WHEN zcl_pr_approval_policy=>can_perform(
                 action         = zcl_pr_approval_policy=>lifecycle_action-reject
                 current_status = requisition-Status ) = abap_true
          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled )

        " Withdrawing is only possible while nobody has signed off yet.
        %action-withdraw = COND #(
          WHEN zcl_pr_approval_policy=>can_perform(
                 action         = zcl_pr_approval_policy=>lifecycle_action-withdraw
                 current_status = requisition-Status ) = abap_true
           AND requisition-CurrentApprovalLevel = 0
          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled )

        %action-close = COND #(
          WHEN zcl_pr_approval_policy=>can_perform(
                 action         = zcl_pr_approval_policy=>lifecycle_action-close
                 current_status = requisition-Status ) = abap_true
          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled )

        %action-reopen = COND #(
          WHEN zcl_pr_approval_policy=>can_perform(
                 action         = zcl_pr_approval_policy=>lifecycle_action-reopen
                 current_status = requisition-Status ) = abap_true
          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled )

        %action-copyRequisition = if_abap_behv=>fc-o-enabled

        " A requisition that left the draft status is history, not a document
        " to be edited.
        %update = COND #( WHEN requisition-Status = zcl_pr_approval_policy=>status-draft
                          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled )
        %delete = COND #( WHEN requisition-Status = zcl_pr_approval_policy=>status-draft
                          THEN if_abap_behv=>fc-o-enabled ELSE if_abap_behv=>fc-o-disabled ) ) ).

  ENDMETHOD.


  METHOD get_instance_authorizations.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        FIELDS ( Requester CreatedBy )
        WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions)
      FAILED failed.

    LOOP AT requisitions INTO DATA(requisition).

      " Only the requester, the creator or a procurement admin may change a
      " requisition. Everyone else can read it - approvers have to.
      AUTHORITY-CHECK OBJECT 'ZPR_ADMIN' ID 'ACTVT' FIELD '02'.
      DATA(is_admin) = xsdbool( sy-subrc = 0 ).

      DATA(is_owner) = xsdbool( requisition-Requester = sy-uname
                             OR requisition-CreatedBy = sy-uname ).

      DATA(granted) = COND #( WHEN is_admin = abap_true OR is_owner = abap_true
                              THEN if_abap_behv=>auth-allowed
                              ELSE if_abap_behv=>auth-unauthorized ).

      APPEND VALUE #( %tky        = requisition-%tky
                      %update     = granted
                      %delete     = granted
                      %action-submit   = granted
                      %action-withdraw = granted
                      %action-reopen   = granted ) TO result.
    ENDLOOP.

  ENDMETHOD.


  METHOD setInitialValues.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        FIELDS ( Status Requester Currency )
        WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions).

    DATA updates TYPE TABLE FOR UPDATE zi_pr_requisition.

    LOOP AT requisitions INTO DATA(requisition) WHERE Status IS INITIAL.
      APPEND VALUE #( %tky                 = requisition-%tky
                      Status               = zcl_pr_approval_policy=>status-draft
                      CurrentApprovalLevel = 0
                      TotalValue           = 0
                      Requester            = COND #( WHEN requisition-Requester IS INITIAL
                                                     THEN sy-uname
                                                     ELSE requisition-Requester )
                      Currency             = COND #( WHEN requisition-Currency IS INITIAL
                                                     THEN 'EUR'
                                                     ELSE requisition-Currency ) ) TO updates.
    ENDLOOP.

    CHECK updates IS NOT INITIAL.

    MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        UPDATE FIELDS ( Status CurrentApprovalLevel TotalValue Requester Currency )
        WITH updates
      REPORTED DATA(update_reported).

  ENDMETHOD.


  METHOD validateHeader.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions).

    LOOP AT requisitions INTO DATA(requisition).

      IF requisition-Title IS INITIAL.
        APPEND VALUE #( %tky = requisition-%tky ) TO failed-requisition.
        APPEND VALUE #( %tky              = requisition-%tky
                        %element-Title    = if_abap_behv=>mk-on
                        %msg              = new_message(
                                              id       = 'ZPR_MSG'
                                              number   = zcl_pr_approval_policy=>message-title_missing
                                              severity = if_abap_behv_message=>severity-error ) )
               TO reported-requisition.
      ENDIF.

      IF requisition-CostCenter IS INITIAL.
        APPEND VALUE #( %tky = requisition-%tky ) TO failed-requisition.
        APPEND VALUE #( %tky                = requisition-%tky
                        %element-CostCenter = if_abap_behv=>mk-on
                        %msg                = new_message(
                                                id       = 'ZPR_MSG'
                                                number   = zcl_pr_approval_policy=>message-cost_center_missing
                                                severity = if_abap_behv_message=>severity-error ) )
               TO reported-requisition.
      ENDIF.

    ENDLOOP.

  ENDMETHOD.


  METHOD submit.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions)
      FAILED failed.

    DATA(reader) = lcl_services=>get_instance( ).

    LOOP AT requisitions INTO DATA(requisition).

      IF zcl_pr_approval_policy=>can_perform(
           action         = zcl_pr_approval_policy=>lifecycle_action-submit
           current_status = requisition-Status ) = abap_false.
        APPEND VALUE #( %tky = requisition-%tky ) TO failed-requisition.
        APPEND VALUE #( %tky = requisition-%tky
                        %msg = new_message(
                                 id       = 'ZPR_MSG'
                                 number   = zcl_pr_approval_policy=>message-invalid_transition
                                 severity = if_abap_behv_message=>severity-error
                                 v1       = requisition-Status ) ) TO reported-requisition.
        CONTINUE.
      ENDIF.

      " Never trust the header: recompute from the items first, then validate.
      reader->recalculate_header( requisition-RequisitionUUID ).

      READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
        ENTITY Requisition
          FIELDS ( TotalValue SupplierRiskClass RequiredApprovalLevel RequisitionNumber )
          WITH VALUE #( ( %tky = requisition-%tky ) )
        RESULT DATA(recalculated).

      DATA(findings) = zcl_pr_approval_policy=>validate_for_submission(
                         requisition = CORRESPONDING #( requisition )
                         items       = reader->read_items( requisition-RequisitionUUID )
                         cost_center = reader->read_cost_center( requisition-CostCenter )
                         today       = cl_abap_context_info=>get_system_date( ) ).

      IF findings IS NOT INITIAL.
        APPEND VALUE #( %tky = requisition-%tky ) TO failed-requisition.
        report_findings( EXPORTING requisition = requisition
                                   findings    = findings
                         CHANGING  reported    = reported ).
        CONTINUE.
      ENDIF.

      DATA(required_level) = recalculated[ 1 ]-RequiredApprovalLevel.
      DATA(number) = COND #( WHEN recalculated[ 1 ]-RequisitionNumber IS NOT INITIAL
                             THEN recalculated[ 1 ]-RequisitionNumber
                             ELSE next_requisition_number( ) ).

      MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
        ENTITY Requisition
          UPDATE FIELDS ( RequisitionNumber Status SubmittedAt CompletedAt
                          RejectionReason CurrentApprovalLevel )
          WITH VALUE #( ( %tky                 = requisition-%tky
                          RequisitionNumber    = number
                          Status               = zcl_pr_approval_policy=>status-in_approval
                          SubmittedAt          = utclong_current( )
                          CompletedAt          = VALUE #( )
                          RejectionReason      = VALUE #( )
                          CurrentApprovalLevel = 0 ) )
        REPORTED DATA(header_reported).

      " Rebuild the chain from scratch: a resubmitted requisition may need a
      " different number of levels than the previous attempt did.
      DELETE FROM zpr_approval WHERE requisition_uuid = @requisition-RequisitionUUID.

      MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
        ENTITY Requisition
          CREATE BY \_Approval
          FIELDS ( ApprovalLevel Decision )
          WITH VALUE #( ( %tky = requisition-%tky
                          %target = VALUE #(
                            FOR level IN zcl_pr_approval_policy=>build_approval_chain( required_level )
                            ( %cid          = |CHAIN{ requisition-RequisitionUUID }{ level }|
                              ApprovalLevel = level
                              Decision      = zcl_pr_approval_policy=>decision-pending ) ) ) )
        REPORTED DATA(chain_reported).

    ENDLOOP.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(final).

    result = VALUE #( FOR row IN final ( %tky = row-%tky %param = row ) ).

  ENDMETHOD.


  METHOD approve.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions).

    " One comment per key - a mass approval is not one decision repeated.
    LOOP AT requisitions INTO DATA(requisition).
      decide( EXPORTING requisition = requisition
                        action      = zcl_pr_approval_policy=>lifecycle_action-approve
                        comment     = keys[ %tky = requisition-%tky ]-%param-Comments
              CHANGING  reported    = reported ).
    ENDLOOP.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(final).
    result = VALUE #( FOR row IN final ( %tky = row-%tky %param = row ) ).

  ENDMETHOD.


  METHOD rejectRequisition.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions).

    LOOP AT requisitions INTO DATA(requisition).
      decide( EXPORTING requisition = requisition
                        action      = zcl_pr_approval_policy=>lifecycle_action-reject
                        comment     = keys[ %tky = requisition-%tky ]-%param-Reason
              CHANGING  reported    = reported ).
    ENDLOOP.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(final).
    result = VALUE #( FOR row IN final ( %tky = row-%tky %param = row ) ).

  ENDMETHOD.


  METHOD decide.

    DATA(reader) = lcl_services=>get_instance( ).

    DATA(findings) = zcl_pr_approval_policy=>validate_decision(
                       requisition = CORRESPONDING #( requisition )
                       action      = action
                       user        = sy-uname
                       roles       = reader->current_user_roles( ) ).

    IF findings IS NOT INITIAL.
      report_findings( EXPORTING requisition = requisition
                                 findings    = findings
                       CHANGING  reported    = reported ).
      RETURN.
    ENDIF.

    DATA(level) = zcl_pr_approval_policy=>next_approval_level( requisition-CurrentApprovalLevel ).

    UPDATE zpr_approval
      SET decision   = @COND #( WHEN action = zcl_pr_approval_policy=>lifecycle_action-approve
                                THEN zcl_pr_approval_policy=>decision-approved
                                ELSE zcl_pr_approval_policy=>decision-rejected ),
          decided_by = @sy-uname,
          decided_at = @( utclong_current( ) ),
          comments   = @comment
      WHERE requisition_uuid = @requisition-RequisitionUUID
        AND approval_level   = @level.

    IF action = zcl_pr_approval_policy=>lifecycle_action-reject.

      " Everything that was still open is obsolete once one level says no.
      UPDATE zpr_approval
        SET decision = @zcl_pr_approval_policy=>decision-skipped
        WHERE requisition_uuid = @requisition-RequisitionUUID
          AND decision         = @zcl_pr_approval_policy=>decision-pending.

      MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
        ENTITY Requisition
          UPDATE FIELDS ( Status RejectionReason CompletedAt )
          WITH VALUE #( ( %tky            = requisition-%tky
                          Status          = zcl_pr_approval_policy=>status-rejected
                          RejectionReason = comment
                          CompletedAt     = utclong_current( ) ) )
        REPORTED DATA(reject_reported).
      RETURN.
    ENDIF.

    DATA(is_final) = zcl_pr_approval_policy=>is_final_approval(
                       level          = level
                       required_level = requisition-RequiredApprovalLevel ).

    MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        UPDATE FIELDS ( Status CurrentApprovalLevel CompletedAt )
        WITH VALUE #( ( %tky                 = requisition-%tky
                        CurrentApprovalLevel = level
                        Status               = COND #( WHEN is_final = abap_true
                                                       THEN zcl_pr_approval_policy=>status-approved
                                                       ELSE zcl_pr_approval_policy=>status-in_approval )
                        CompletedAt          = COND #( WHEN is_final = abap_true
                                                       THEN utclong_current( ) ) ) )
      REPORTED DATA(approve_reported).

    IF is_final = abap_true.
      " The budget is committed the moment the last signature is there, not
      " when the purchase order is created - otherwise two requisitions could
      " both pass the budget check against the same remaining amount.
      UPDATE zpr_costctr
        SET consumed_budget = consumed_budget + @requisition-TotalValue
        WHERE cost_center = @requisition-CostCenter.
    ENDIF.


  ENDMETHOD.


  METHOD withdraw.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions)
      FAILED failed.

    LOOP AT requisitions INTO DATA(requisition).

      IF zcl_pr_approval_policy=>can_perform(
           action         = zcl_pr_approval_policy=>lifecycle_action-withdraw
           current_status = requisition-Status ) = abap_false
         OR requisition-CurrentApprovalLevel > 0.
        APPEND VALUE #( %tky = requisition-%tky ) TO failed-requisition.
        APPEND VALUE #( %tky = requisition-%tky
                        %msg = new_message(
                                 id       = 'ZPR_MSG'
                                 number   = zcl_pr_approval_policy=>message-invalid_transition
                                 severity = if_abap_behv_message=>severity-error
                                 v1       = requisition-Status ) ) TO reported-requisition.
        CONTINUE.
      ENDIF.

      DELETE FROM zpr_approval WHERE requisition_uuid = @requisition-RequisitionUUID.

      MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
        ENTITY Requisition
          UPDATE FIELDS ( Status SubmittedAt CurrentApprovalLevel )
          WITH VALUE #( ( %tky                 = requisition-%tky
                          Status               = zcl_pr_approval_policy=>status-draft
                          SubmittedAt          = VALUE #( )
                          CurrentApprovalLevel = 0 ) )
        REPORTED DATA(update_reported).
    ENDLOOP.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(final).
    result = VALUE #( FOR row IN final ( %tky = row-%tky %param = row ) ).

  ENDMETHOD.


  METHOD close.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition FIELDS ( Status ) WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions)
      FAILED failed.

    LOOP AT requisitions INTO DATA(requisition).
      DATA(target) = zcl_pr_approval_policy=>target_status(
                       action         = zcl_pr_approval_policy=>lifecycle_action-close
                       current_status = requisition-Status ).

      IF target IS INITIAL.
        APPEND VALUE #( %tky = requisition-%tky ) TO failed-requisition.
        APPEND VALUE #( %tky = requisition-%tky
                        %msg = new_message(
                                 id       = 'ZPR_MSG'
                                 number   = zcl_pr_approval_policy=>message-invalid_transition
                                 severity = if_abap_behv_message=>severity-error
                                 v1       = requisition-Status ) ) TO reported-requisition.
        CONTINUE.
      ENDIF.

      MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
        ENTITY Requisition
          UPDATE FIELDS ( Status )
          WITH VALUE #( ( %tky = requisition-%tky Status = target ) )
        REPORTED DATA(update_reported).
    ENDLOOP.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(final).
    result = VALUE #( FOR row IN final ( %tky = row-%tky %param = row ) ).

  ENDMETHOD.


  METHOD reopen.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition FIELDS ( Status RequisitionUUID ) WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions)
      FAILED failed.

    LOOP AT requisitions INTO DATA(requisition).

      IF zcl_pr_approval_policy=>can_perform(
           action         = zcl_pr_approval_policy=>lifecycle_action-reopen
           current_status = requisition-Status ) = abap_false.
        APPEND VALUE #( %tky = requisition-%tky ) TO failed-requisition.
        APPEND VALUE #( %tky = requisition-%tky
                        %msg = new_message(
                                 id       = 'ZPR_MSG'
                                 number   = zcl_pr_approval_policy=>message-invalid_transition
                                 severity = if_abap_behv_message=>severity-error
                                 v1       = requisition-Status ) ) TO reported-requisition.
        CONTINUE.
      ENDIF.

      DELETE FROM zpr_approval WHERE requisition_uuid = @requisition-RequisitionUUID.

      MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
        ENTITY Requisition
          UPDATE FIELDS ( Status SubmittedAt CompletedAt RejectionReason CurrentApprovalLevel )
          WITH VALUE #( ( %tky                 = requisition-%tky
                          Status               = zcl_pr_approval_policy=>status-draft
                          SubmittedAt          = VALUE #( )
                          CompletedAt          = VALUE #( )
                          RejectionReason      = VALUE #( )
                          CurrentApprovalLevel = 0 ) )
        REPORTED DATA(update_reported).
    ENDLOOP.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(final).
    result = VALUE #( FOR row IN final ( %tky = row-%tky %param = row ) ).

  ENDMETHOD.


  METHOD copyRequisition.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(requisitions)
      ENTITY Requisition BY \_Item
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(items).

    DATA new_requisitions TYPE TABLE FOR CREATE zi_pr_requisition.
    DATA new_items TYPE TABLE FOR CREATE zi_pr_requisition\_Item.

    LOOP AT requisitions INTO DATA(requisition).

      APPEND VALUE #( %cid        = keys[ %tky = requisition-%tky ]-%cid_ref
                      Title       = |{ requisition-Title } (copy)|
                      Description = requisition-Description
                      Requester   = sy-uname
                      CostCenter  = requisition-CostCenter
                      Currency    = requisition-Currency
                      Status      = zcl_pr_approval_policy=>status-draft ) TO new_requisitions.

      APPEND VALUE #( %cid_ref = keys[ %tky = requisition-%tky ]-%cid_ref
                      %target  = VALUE #(
                        FOR item IN items WHERE ( RequisitionUUID = requisition-RequisitionUUID )
                        ( %cid         = |ITEM{ item-ItemUUID }|
                          Product      = item-Product
                          Description  = item-Description
                          Quantity     = item-Quantity
                          QuantityUnit = item-QuantityUnit
                          UnitPrice    = item-UnitPrice
                          Currency     = item-Currency
                          Supplier     = item-Supplier
                          Plant        = item-Plant
                          DeliveryDate = item-DeliveryDate ) ) ) TO new_items.
    ENDLOOP.

    MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Requisition
        CREATE FIELDS ( Title Description Requester CostCenter Currency Status )
        WITH new_requisitions
      CREATE BY \_Item
        FIELDS ( Product Description Quantity QuantityUnit UnitPrice Currency
                 Supplier Plant DeliveryDate )
        WITH new_items
      MAPPED mapped
      FAILED failed
      REPORTED reported.

  ENDMETHOD.


  METHOD next_requisition_number.

    " A productive implementation calls a number range object
    " (cl_numberrange_runtime=>number_get) to stay gap free under load.
    " Reading the current maximum is good enough for a demo landscape and is
    " documented as such in docs/adr/0005-number-assignment.md.
    DATA(prefix) = |PR-{ cl_abap_context_info=>get_system_date( )(4) }-|.

    SELECT MAX( requisition_number ) AS last_number
      FROM zpr_req_hdr
      WHERE requisition_number LIKE @( |{ prefix }%| )
      INTO @DATA(last_number).

    DATA(sequence) = COND i( WHEN last_number IS INITIAL
                             THEN 1
                             ELSE CONV i( last_number+8(6) ) + 1 ).

    result = |{ prefix }{ sequence WIDTH = 6 PAD = '0' ALIGN = RIGHT }|.

  ENDMETHOD.


  METHOD report_findings.

    LOOP AT findings INTO DATA(finding).
      " new_message_with_text keeps the composed texts of the policy class.
      " A productive implementation would pass the placeholders to the message
      " class ZPR_MSG instead, so the text is translatable.
      APPEND VALUE #( %tky = requisition-%tky
                      %msg = new_message_with_text(
                               severity = if_abap_behv_message=>severity-error
                               text     = finding-text ) ) TO reported-requisition.
    ENDLOOP.

  ENDMETHOD.

ENDCLASS.


CLASS lhc_item DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.

    METHODS deriveItemValues FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Item~deriveItemValues.

    METHODS recalculateHeader FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Item~recalculateHeader.

    METHODS validateItem FOR VALIDATE ON SAVE
      IMPORTING keys FOR Item~validateItem.

ENDCLASS.


CLASS lhc_item IMPLEMENTATION.

  METHOD deriveItemValues.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Item
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(items).

    DATA updates TYPE TABLE FOR UPDATE zi_pr_requisition\\Item.

    LOOP AT items INTO DATA(item).

      DATA(update) = VALUE FOR UPDATE zi_pr_requisition\\Item( %tky = item-%tky ).

      " Default description, unit and price from the product master, but never
      " overwrite what the user typed.
      IF item-Product IS NOT INITIAL.
        SELECT SINGLE product~BaseUnit,
                      text~ProductDescription
          FROM I_Product AS product
          LEFT OUTER JOIN I_ProductDescription AS text
            ON  text~Product  = product~Product
            AND text~Language = @sy-langu
          WHERE product~Product = @item-Product
          INTO @DATA(master).

        IF sy-subrc = 0.
          " Default, never overwrite: what the user typed wins.
          IF item-Description IS INITIAL.
            update-Description = master-ProductDescription.
          ENDIF.
          IF item-QuantityUnit IS INITIAL.
            update-QuantityUnit = master-BaseUnit.
          ENDIF.
        ENDIF.
      ENDIF.

      " ABAP packed numbers are exact in base 10, so a single multiplication
      " is enough - no cent arithmetic needed, unlike in JavaScript.
      update-NetAmount = item-Quantity * item-UnitPrice.

      APPEND update TO updates.
    ENDLOOP.

    CHECK updates IS NOT INITIAL.

    MODIFY ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Item
        UPDATE FIELDS ( Description QuantityUnit NetAmount )
        WITH updates
      REPORTED DATA(update_reported).

  ENDMETHOD.


  METHOD recalculateHeader.

    " The totals live on the header, but only an item change can make them
    " wrong - so the determination that maintains them sits here, where the
    " trigger is. A determination on the header would never fire when only an
    " item changed.
    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Item
        FIELDS ( RequisitionUUID )
        WITH CORRESPONDING #( keys )
      RESULT DATA(items).

    DATA(services) = lcl_services=>get_instance( ).
    DATA(done) = VALUE string_table( ).

    LOOP AT items INTO DATA(item).
      DATA(uuid) = CONV string( item-RequisitionUUID ).
      " A mass update touches many items of the same document - recalculate
      " each document once, not once per item.
      CHECK NOT line_exists( done[ table_line = uuid ] ).
      APPEND uuid TO done.

      services->recalculate_header( item-RequisitionUUID ).
    ENDLOOP.

  ENDMETHOD.


  METHOD validateItem.

    READ ENTITIES OF zi_pr_requisition IN LOCAL MODE
      ENTITY Item
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(items).

    LOOP AT items INTO DATA(item).

      " The dedicated single item rule - the same one VALIDATE_FOR_SUBMISSION
      " applies per item, so an item cannot pass here and fail on submit.
      DATA(findings) = zcl_pr_approval_policy=>validate_item(
                         item  = VALUE #( item_number   = item-ItemNumber
                                          quantity      = item-Quantity
                                          unit_price    = item-UnitPrice
                                          net_amount    = item-NetAmount
                                          delivery_date = item-DeliveryDate
                                          supplier      = item-Supplier )
                         today = cl_abap_context_info=>get_system_date( ) ).

      LOOP AT findings INTO DATA(finding).
        APPEND VALUE #( %tky = item-%tky ) TO failed-item.
        APPEND VALUE #( %tky = item-%tky
                        %msg = new_message_with_text(
                                 severity = if_abap_behv_message=>severity-error
                                 text     = finding-text ) ) TO reported-item.
      ENDLOOP.

    ENDLOOP.

  ENDMETHOD.

ENDCLASS.
