@EndUserText.label: 'Rejection reason'
// Parameter structure of the `rejectRequisition` action.
// Mandatory: a rejection without a reason costs the requester a phone call.
define abstract entity ZD_PR_RejectionReason
{
  @EndUserText.label: 'Reason'
  @Consumption.valueHelpDefinition: []
  Reason : abap.string(500);
}
