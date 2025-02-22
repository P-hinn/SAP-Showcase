"! <p class="shorttext synchronized">Virtual element: Fiori criticality</p>
"!
"! Calculates the colour of a status, a decision and a risk class for the Fiori
"! UI: 1 = red, 2 = yellow, 3 = green, 0 = neutral.
"!
"! A virtual element rather than a column, because criticality is presentation,
"! not data: it must never end up in the database, where the next UI would have
"! to live with the colour scheme of the previous one.
CLASS zcl_pr_criticality DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_sadl_exit_calc_element_read.

    CONSTANTS:
      BEGIN OF criticality,
        neutral  TYPE i VALUE 0,
        negative TYPE i VALUE 1,
        critical TYPE i VALUE 2,
        positive TYPE i VALUE 3,
      END OF criticality.

    "! Colour of a requisition status.
    CLASS-METHODS for_status
      IMPORTING status        TYPE zpr_req_hdr-status
      RETURNING VALUE(result) TYPE i.

    "! Colour of a supplier risk class.
    CLASS-METHODS for_risk_class
      IMPORTING risk_class    TYPE zpr_sup_risk-risk_class
      RETURNING VALUE(result) TYPE i.

    "! Colour of an approval decision.
    CLASS-METHODS for_decision
      IMPORTING decision      TYPE zpr_approval-decision
      RETURNING VALUE(result) TYPE i.

ENDCLASS.


CLASS zcl_pr_criticality IMPLEMENTATION.

  METHOD for_status.
    result = SWITCH #( status
      WHEN zcl_pr_approval_policy=>status-in_approval THEN criticality-critical
      WHEN zcl_pr_approval_policy=>status-approved    THEN criticality-positive
      WHEN zcl_pr_approval_policy=>status-rejected    THEN criticality-negative
      ELSE                                                 criticality-neutral ).
  ENDMETHOD.


  METHOD for_risk_class.
    result = SWITCH #( risk_class
      WHEN 'A' THEN criticality-positive
      WHEN 'B' THEN criticality-critical
      WHEN 'C' THEN criticality-negative
      ELSE          criticality-neutral ).
  ENDMETHOD.


  METHOD for_decision.
    result = SWITCH #( decision
      WHEN zcl_pr_approval_policy=>decision-pending  THEN criticality-critical
      WHEN zcl_pr_approval_policy=>decision-approved THEN criticality-positive
      WHEN zcl_pr_approval_policy=>decision-rejected THEN criticality-negative
      ELSE                                                criticality-neutral ).
  ENDMETHOD.


  METHOD if_sadl_exit_calc_element_read~calculate.

    " One class serves the virtual elements of three views. `it_original_data`
    " carries whatever the framework read, so the fields are addressed
    " dynamically.
    FIELD-SYMBOLS <rows> TYPE STANDARD TABLE.
    ASSIGN it_original_data->* TO <rows>.
    IF <rows> IS NOT ASSIGNED.
      RETURN.
    ENDIF.

    LOOP AT <rows> ASSIGNING FIELD-SYMBOL(<row>).

      ASSIGN COMPONENT 'STATUS' OF STRUCTURE <row> TO FIELD-SYMBOL(<status>).
      IF sy-subrc = 0.
        ASSIGN COMPONENT 'STATUSCRITICALITY' OF STRUCTURE <row> TO FIELD-SYMBOL(<target>).
        IF sy-subrc = 0.
          <target> = for_status( CONV #( <status> ) ).
        ENDIF.
      ENDIF.

      ASSIGN COMPONENT 'SUPPLIERRISKCLASS' OF STRUCTURE <row> TO FIELD-SYMBOL(<header_risk>).
      IF sy-subrc = 0.
        ASSIGN COMPONENT 'SUPPLIERRISKCRITICALITY' OF STRUCTURE <row> TO <target>.
        IF sy-subrc = 0.
          <target> = for_risk_class( CONV #( <header_risk> ) ).
        ENDIF.
      ENDIF.

      ASSIGN COMPONENT 'RISKCLASS' OF STRUCTURE <row> TO FIELD-SYMBOL(<risk_class>).
      IF sy-subrc = 0.
        ASSIGN COMPONENT 'RISKCRITICALITY' OF STRUCTURE <row> TO <target>.
        IF sy-subrc = 0.
          <target> = for_risk_class( CONV #( <risk_class> ) ).
        ENDIF.
      ENDIF.

      ASSIGN COMPONENT 'DECISION' OF STRUCTURE <row> TO FIELD-SYMBOL(<decision>).
      IF sy-subrc = 0.
        ASSIGN COMPONENT 'DECISIONCRITICALITY' OF STRUCTURE <row> TO <target>.
        IF sy-subrc = 0.
          <target> = for_decision( CONV #( <decision> ) ).
        ENDIF.
      ENDIF.

    ENDLOOP.

  ENDMETHOD.


  METHOD if_sadl_exit_calc_element_read~get_calculation_info.
    " Tells the framework which stored fields the virtual elements need, so it
    " reads them even when the client did not ask for them.
    LOOP AT it_requested_calc_elements INTO DATA(element).
      CASE to_upper( element ).
        WHEN 'STATUSCRITICALITY'.
          APPEND 'STATUS' TO et_requested_orig_elements.
        WHEN 'SUPPLIERRISKCRITICALITY'.
          APPEND 'SUPPLIERRISKCLASS' TO et_requested_orig_elements.
        WHEN 'RISKCRITICALITY'.
          APPEND 'RISKCLASS' TO et_requested_orig_elements.
        WHEN 'DECISIONCRITICALITY'.
          APPEND 'DECISION' TO et_requested_orig_elements.
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
