@EndUserText.label: 'Approval comment'
// Parameter structure of the `approve` action.
define abstract entity ZD_PR_ApprovalComment
{
  @EndUserText.label: 'Comment'
  Comments : abap.string(500);
}
