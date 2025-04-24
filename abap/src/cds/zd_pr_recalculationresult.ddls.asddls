@EndUserText.label: 'Risk recalculation result'
// Result structure of the static action `recalculateAllRisks`.
define abstract entity ZD_PR_RecalculationResult
{
  @EndUserText.label: 'Suppliers evaluated'
  Evaluated : abap.int4;
  @EndUserText.label: 'Scores changed'
  Changed   : abap.int4;
}
