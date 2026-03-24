using { acme.procurement as db } from './schema';

// Which fields hold personal data. User IDs are the only personal data in this
// model - no names, no e-mail addresses, no contact details are stored.
//
// These annotations are what the SAP audit logging plugin
// (@cap-js/audit-logging) reads to log access to and changes of personal
// data. The plugin is not installed in this showcase; the annotations make
// adding it a configuration step instead of a modelling project.
// docs/security-and-operations.md has the details.

annotate db.PurchaseRequisitions with @PersonalData.EntitySemantics: 'Other' {
  requester @PersonalData.FieldSemantics: 'DataSubjectID';
  createdBy  @PersonalData.IsPotentiallyPersonal;
  modifiedBy @PersonalData.IsPotentiallyPersonal;
};

annotate db.ApprovalSteps with @PersonalData.EntitySemantics: 'Other' {
  decidedBy @PersonalData.FieldSemantics: 'DataSubjectID';
};

annotate db.RequisitionEvents with @PersonalData.EntitySemantics: 'Other' {
  actor @PersonalData.FieldSemantics: 'DataSubjectID';
};

annotate db.Notifications with @PersonalData.EntitySemantics: 'Other' {
  recipientUser @PersonalData.FieldSemantics: 'DataSubjectID';
  requester     @PersonalData.IsPotentiallyPersonal;
};
