using ProcurementService as service from '../../srv/procurement-service';

// Fiori Elements annotations for the "Manage Purchase Requisitions" app
// (List Report + Object Page, OData V4).
//
// Everything the app shows is driven from here - there is no custom UI5
// controller in this project on purpose. An annotation driven app is the
// cheapest app to maintain and the one that survives an SAP UI5 upgrade.
//
// Note: these are line comments, not doc comments. A /** */ block in front of
// an `annotate` statement is itself an annotation assignment and collides with
// the block that follows it.

// ====================================================================
// List Report
// ====================================================================
annotate service.PurchaseRequisitions with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : 'Purchase Requisition',
      TypeNamePlural: 'Purchase Requisitions',
      Title         : { $Type: 'UI.DataField', Value: title },
      Description   : { $Type: 'UI.DataField', Value: requisitionNumber }
    },

    // Filter bar
    SelectionFields: [
      status_code,
      supplierRiskClass_code,
      requiredApprovalLevel_code,
      requester,
      costCenter_ID
    ],

    // Result table
    LineItem: [
      {
        $Type: 'UI.DataField',
        Value: requisitionNumber,
        Label: 'Requisition'
      },
      {
        $Type    : 'UI.DataField',
        Value    : title,
        ![@UI.Importance]: #High
      },
      {
        $Type: 'UI.DataField',
        Value: requester
      },
      {
        $Type: 'UI.DataField',
        Value: costCenter.costCenterCode,
        Label: 'Cost Center'
      },
      {
        $Type    : 'UI.DataField',
        Value    : totalValue,
        ![@UI.Importance]: #High
      },
      {
        $Type      : 'UI.DataField',
        Value      : supplierRiskClass_code,
        Criticality: supplierRiskClass.criticality,
        Label      : 'Supplier Risk'
      },
      {
        $Type: 'UI.DataField',
        Value: requiredApprovalLevel_code,
        Label: 'Required Level'
      },
      {
        $Type      : 'UI.DataField',
        Value      : status_code,
        Criticality: status.criticality,
        Label      : 'Status'
      },
      // Actions rendered as buttons in the table toolbar. Each one is hidden
      // unless the requisition is in the status that allows it, so the UI
      // never offers something the service would reject.
      {
        $Type    : 'UI.DataFieldForAction',
        Action   : 'ProcurementService.submit',
        Label    : 'Submit',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'DR']}}
      },
      {
        $Type    : 'UI.DataFieldForAction',
        Action   : 'ProcurementService.approve',
        Label    : 'Approve',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}}
      },
      {
        $Type    : 'UI.DataFieldForAction',
        Action   : 'ProcurementService.rejectRequisition',
        Label    : 'Reject',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}}
      }
    ],

    // Key figures in the object page header
    HeaderFacets: [
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#TotalValue', ID: 'dpTotal' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status', ID: 'dpStatus' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Risk', ID: 'dpRisk' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#ApprovalProgress', ID: 'dpProgress' }
    ],

    DataPoint #TotalValue: {
      $Type: 'UI.DataPointType',
      Value: totalValue,
      Title: 'Total Net Value'
    },
    DataPoint #Status: {
      $Type      : 'UI.DataPointType',
      Value      : status_code,
      Title      : 'Status',
      Criticality: status.criticality
    },
    DataPoint #Risk: {
      $Type      : 'UI.DataPointType',
      Value      : supplierRiskClass_code,
      Title      : 'Supplier Risk Class',
      Criticality: supplierRiskClass.criticality
    },
    // How many of the required levels have already signed off.
    DataPoint #ApprovalProgress: {
      $Type        : 'UI.DataPointType',
      Value        : currentApprovalLevel,
      Title        : 'Approved Levels',
      TargetValue  : requiredApprovalLevel_code,
      Visualization: #Progress
    },

    // Object page layout
    Facets: [
      {
        $Type : 'UI.CollectionFacet',
        ID    : 'GeneralFacet',
        Label : 'General Information',
        Facets: [
          { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#General', ID: 'fgGeneral', Label: 'Header' },
          { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Approval', ID: 'fgApproval', Label: 'Approval' }
        ]
      },
      {
        $Type : 'UI.ReferenceFacet',
        ID    : 'ItemsFacet',
        Label : 'Items',
        Target: 'items/@UI.LineItem'
      },
      {
        $Type : 'UI.ReferenceFacet',
        ID    : 'ApprovalFacet',
        Label : 'Approval Chain',
        Target: 'approvalSteps/@UI.LineItem'
      }
    ],

    FieldGroup #General: {
      Data: [
        { $Type: 'UI.DataField', Value: requisitionNumber },
        { $Type: 'UI.DataField', Value: title },
        { $Type: 'UI.DataField', Value: description },
        { $Type: 'UI.DataField', Value: requester },
        { $Type: 'UI.DataField', Value: costCenter_ID, Label: 'Cost Center' },
        { $Type: 'UI.DataField', Value: currency_code, Label: 'Currency' }
      ]
    },

    FieldGroup #Approval: {
      Data: [
        { $Type: 'UI.DataField', Value: requiredApprovalLevel_code, Label: 'Required Approval Level' },
        { $Type: 'UI.DataField', Value: currentApprovalLevel, Label: 'Approved Up To Level' },
        { $Type: 'UI.DataField', Value: submittedAt },
        { $Type: 'UI.DataField', Value: completedAt },
        {
          $Type      : 'UI.DataField',
          Value      : rejectionReason,
          Criticality: #Negative,
          ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'RE']}}
        }
      ]
    },

    // Buttons in the object page header
    Identification: [
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.submit', Label: 'Submit for Approval',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'DR']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.approve', Label: 'Approve',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.rejectRequisition', Label: 'Reject',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.withdraw', Label: 'Withdraw',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.close', Label: 'Mark as Ordered',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'AP']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.reopen', Label: 'Rework',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'RE']}} }
    ]
  }
);

// Side effects: changing an item changes the total value, the risk class and
// the required approval level. Without this the user would have to reload the
// page to see the new approval path - with it, the header refreshes itself.
annotate service.PurchaseRequisitions with @(
  Common.SideEffects #recalculateOnItemChange: {
    SourceEntities: [ items ],
    TargetProperties: [
      'totalValue',
      'supplierRiskClass_code',
      'requiredApprovalLevel_code'
    ]
  }
);

// Field level labels and value helps
annotate service.PurchaseRequisitions with {
  requisitionNumber @title: 'Requisition Number' @Common.FieldControl: #ReadOnly;
  title             @title: 'Title';
  description       @title: 'Description' @UI.MultiLineText;
  requester         @title: 'Requester';
  totalValue        @title: 'Total Net Value' @Measures.ISOCurrency: currency_code;
  currentApprovalLevel @title: 'Approved Up To Level' @Common.FieldControl: #ReadOnly;
  submittedAt       @title: 'Submitted At' @Common.FieldControl: #ReadOnly;
  completedAt       @title: 'Completed At' @Common.FieldControl: #ReadOnly;
  rejectionReason   @title: 'Rejection Reason' @UI.MultiLineText @Common.FieldControl: #ReadOnly;

  costCenter @(
    title: 'Cost Center',
    Common: {
      Text           : costCenter.name,
      TextArrangement: #TextFirst,
      ValueListWithFixedValues: false,
      ValueList: {
        CollectionPath: 'CostCenters',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: costCenter_ID, ValueListProperty: 'ID' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'costCenterCode' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'responsible' }
        ]
      }
    }
  );
};

// ====================================================================
// Items
// ====================================================================
annotate service.PurchaseRequisitionItems with @(
  UI: {
    LineItem: [
      { $Type: 'UI.DataField', Value: itemNumber, Label: 'Item' },
      { $Type: 'UI.DataField', Value: material_ID, Label: 'Material' },
      { $Type: 'UI.DataField', Value: description, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: quantity },
      { $Type: 'UI.DataField', Value: unit },
      { $Type: 'UI.DataField', Value: unitPrice },
      { $Type: 'UI.DataField', Value: netAmount, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: supplier_ID, Label: 'Supplier' },
      { $Type: 'UI.DataField', Value: deliveryDate }
    ],
    Facets: [
      { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#ItemDetails', ID: 'fgItem', Label: 'Item Details' }
    ],
    FieldGroup #ItemDetails: {
      Data: [
        { $Type: 'UI.DataField', Value: itemNumber },
        { $Type: 'UI.DataField', Value: material_ID, Label: 'Material' },
        { $Type: 'UI.DataField', Value: description },
        { $Type: 'UI.DataField', Value: quantity },
        { $Type: 'UI.DataField', Value: unit },
        { $Type: 'UI.DataField', Value: unitPrice },
        { $Type: 'UI.DataField', Value: netAmount },
        { $Type: 'UI.DataField', Value: supplier_ID, Label: 'Supplier' },
        { $Type: 'UI.DataField', Value: plant_ID, Label: 'Plant' },
        { $Type: 'UI.DataField', Value: deliveryDate }
      ]
    }
  }
);

// Picking a material defaults the description, the unit and the price, and
// changing quantity or price recalculates the net amount - all server side,
// implemented by deriveItemFields() in srv/procurement-service.js.
annotate service.PurchaseRequisitionItems with @(
  Common.SideEffects #materialChosen: {
    SourceProperties: [ material_ID ],
    TargetProperties: [ 'description', 'unit', 'unitPrice', 'netAmount' ]
  },
  Common.SideEffects #amountRelevant: {
    SourceProperties: [ quantity, unitPrice ],
    TargetProperties: [ 'netAmount' ]
  }
);

annotate service.PurchaseRequisitionItems with {
  itemNumber   @title: 'Item' @Common.FieldControl: #ReadOnly;
  description  @title: 'Description';
  quantity     @title: 'Quantity' @Measures.Unit: unit;
  unit         @title: 'Unit';
  unitPrice    @title: 'Unit Price' @Measures.ISOCurrency: currency_code;
  netAmount    @title: 'Net Amount' @Measures.ISOCurrency: currency_code @Common.FieldControl: #ReadOnly;
  deliveryDate @title: 'Delivery Date';

  material @(
    title: 'Material',
    Common: {
      Text           : material.description,
      TextArrangement: #TextFirst,
      ValueList: {
        CollectionPath: 'Materials',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: material_ID, ValueListProperty: 'ID' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'materialNumber' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'baseUnit' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'standardPrice' }
        ]
      }
    }
  );

  supplier @(
    title: 'Supplier',
    Common: {
      Text           : supplier.name,
      TextArrangement: #TextFirst,
      ValueList: {
        CollectionPath: 'Suppliers',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: supplier_ID, ValueListProperty: 'ID' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'supplierNumber' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'riskScore' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'riskClass_code' }
        ]
      }
    }
  );

  plant @(
    title: 'Plant',
    Common: {
      Text           : plant.name,
      TextArrangement: #TextFirst,
      ValueListWithFixedValues: true,
      ValueList: {
        CollectionPath: 'Plants',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: plant_ID, ValueListProperty: 'ID' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'plantCode' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
      }
    }
  );
};

// ====================================================================
// Approval chain
// ====================================================================
annotate service.ApprovalSteps with @(
  UI: {
    LineItem: [
      { $Type: 'UI.DataField', Value: level_code, Label: 'Level' },
      { $Type: 'UI.DataField', Value: level.name, Label: 'Approver Role' },
      { $Type: 'UI.DataField', Value: decision_code, Criticality: decision.criticality, Label: 'Decision' },
      { $Type: 'UI.DataField', Value: decidedBy, Label: 'Decided By' },
      { $Type: 'UI.DataField', Value: decidedAt, Label: 'Decided At' },
      { $Type: 'UI.DataField', Value: comment, Label: 'Comment' }
    ]
  }
);
