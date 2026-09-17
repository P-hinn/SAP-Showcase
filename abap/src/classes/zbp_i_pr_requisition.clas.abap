"! <p class="shorttext synchronized">Behaviour pool: purchase requisition</p>
"!
"! The global class is empty by design - all handlers live in the local types
"! (see the "Local Types" tab in ADT, file zbp_i_pr_requisition.clas.locals_imp).
"! That is the RAP convention and it keeps the handler classes out of the
"! public API of the package.
CLASS zbp_i_pr_requisition DEFINITION
  PUBLIC
  ABSTRACT
  FINAL
  FOR BEHAVIOR OF zi_pr_requisition.
ENDCLASS.

CLASS zbp_i_pr_requisition IMPLEMENTATION.
ENDCLASS.
