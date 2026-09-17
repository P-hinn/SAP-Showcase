using ProcurementService as service from '../../srv/procurement-service';

// Fiori Elements annotations for "Meine Genehmigungen" (approver inbox).
//
// A list report without an object page of its own: the approver decides in
// the row, and the title links to the full requisition in the requisitions
// app when more context is needed.

annotate service.MyApprovalTasks with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : '{i18n>ApprovalTask}',
      TypeNamePlural: '{i18n>ApprovalTasks}',
      TypeImageUrl  : 'sap-icon://approvals',
      Title         : { $Type: 'UI.DataField', Value: title },
      Description   : { $Type: 'UI.DataField', Value: requisitionNumber }
    },

    SelectionFields: [ supplierRiskClass_code, pendingApprovalLevel, requester, costCenter_ID ],

    LineItem: [
      {
        $Type : 'UI.DataFieldWithUrl',
        Value : title,
        Label : '{i18n>PurchaseRequisition}',
        Url   : {$edmJson: {
          $Apply: [
            '../../purchase-requisitions/webapp/index.html#/PurchaseRequisitions(ID=',
            {$Path: 'ID'},
            ',IsActiveEntity=true)'
          ],
          $Function: 'odata.concat'
        }},
        ![@UI.Importance]: #High
      },
      { $Type: 'UI.DataField', Value: requisitionNumber, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: requester, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: totalValue, ![@UI.Importance]: #High },
      {
        $Type                    : 'UI.DataField',
        Value                    : supplierRiskClass_code,
        Criticality              : supplierRiskClass.criticality,
        CriticalityRepresentation: #WithIcon,
        ![@UI.Importance]        : #High
      },
      {
        $Type : 'UI.DataFieldForAnnotation',
        Target: '@UI.DataPoint#Progress',
        Label : '{i18n>ApprovedLevels}',
        ![@UI.Importance]: #High
      },
      { $Type: 'UI.DataField', Value: pendingApprovalLevel, ![@UI.Importance]: #High },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.approve', Label: '{i18n>ActionApprove}', Inline: true, Criticality: #Positive },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.rejectRequisition', Label: '{i18n>ActionReject}', Inline: true, Criticality: #Negative }
    ],

    DataPoint #Progress: {
      $Type        : 'UI.DataPointType',
      Value        : currentApprovalLevel,
      TargetValue  : requiredApprovalLevel_code,
      Visualization: #Progress
    },

    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: submittedAt } ]
    }
  }
);

annotate service.MyApprovalTasks with {
  requisitionNumber    @title: '{i18n>RequisitionNumber}';
  title                @title: '{i18n>Title}';
  requester            @title: '{i18n>Requester}';
  totalValue           @title: '{i18n>TotalNetValue}' @Measures.ISOCurrency: currency_code;
  submittedAt          @title: '{i18n>SubmittedAt}';
  currentApprovalLevel @title: '{i18n>ApprovedUpToLevel}';
  pendingApprovalLevel @title: '{i18n>YourLevel}';
  createdBy            @UI.Hidden;
  status               @UI.Hidden;
  description          @UI.Hidden;

  supplierRiskClass @(
    title : '{i18n>SupplierRisk}',
    Common: {
      Text                    : supplierRiskClass.name,
      TextArrangement         : #TextOnly,
      ValueListWithFixedValues: true,
      ValueList: {
        CollectionPath: 'RiskClasses',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: supplierRiskClass_code, ValueListProperty: 'code' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
      }
    }
  );
  costCenter @(
    title : '{i18n>CostCenter}',
    Common: { Text: costCenter.name, TextArrangement: #TextOnly }
  );
  requiredApprovalLevel @(
    title : '{i18n>RequiredApprovalLevel}',
    Common: { Text: requiredApprovalLevel.name, TextArrangement: #TextOnly }
  );
};

// A decision removes the row from the inbox - reload the list.
annotate service.MyApprovalTasks actions {
  approve @Common.SideEffects: { TargetEntities: [ '/ProcurementService.EntityContainer/MyApprovalTasks' ] };
  rejectRequisition @Common.SideEffects: { TargetEntities: [ '/ProcurementService.EntityContainer/MyApprovalTasks' ] };
};
