using ProcurementService as service from '../../srv/procurement-service';

// Fiori Elements annotations for the "Manage Purchase Requisitions" app
// (List Report + Object Page, OData V4).
//
// Everything the app shows is driven from here - there is no custom UI5
// controller in this project on purpose. An annotation driven app is the
// cheapest app to maintain and the one that survives an SAP UI5 upgrade.
//
// Every text is an i18n key ({i18n>...}) resolved from cap/_i18n. CAP picks
// the bundle from the request language, so the same $metadata document comes
// back in German for ?sap-language=DE and in English otherwise.
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
      TypeName      : '{i18n>PurchaseRequisition}',
      TypeNamePlural: '{i18n>PurchaseRequisitions}',
      TypeImageUrl  : 'sap-icon://request',
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
        $Type : 'UI.DataFieldForAnnotation',
        Target: '@UI.FieldGroup#Identity',
        Label : '{i18n>PurchaseRequisition}',
        ![@UI.Importance]: #High
      },
      { $Type: 'UI.DataField', Value: requester },
      { $Type: 'UI.DataField', Value: costCenter_ID },
      {
        $Type    : 'UI.DataField',
        Value    : totalValue,
        ![@UI.Importance]: #High
      },
      {
        $Type      : 'UI.DataField',
        Value      : supplierRiskClass_code,
        Criticality: supplierRiskClass.criticality
      },
      { $Type: 'UI.DataField', Value: requiredApprovalLevel_code },
      {
        $Type                    : 'UI.DataField',
        Value                    : status_code,
        Criticality              : status.criticality,
        CriticalityRepresentation: #WithIcon,
        ![@UI.Importance]        : #High
      },
      // Actions rendered as buttons in the table toolbar. Each one is hidden
      // unless the requisition is in the status that allows it, so the UI
      // never offers something the service would reject.
      {
        $Type    : 'UI.DataFieldForAction',
        Action   : 'ProcurementService.submit',
        Label    : '{i18n>ActionSubmit}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'DR']}}
      },
      {
        $Type    : 'UI.DataFieldForAction',
        Action   : 'ProcurementService.approve',
        Label    : '{i18n>ActionApprove}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}}
      },
      {
        $Type    : 'UI.DataFieldForAction',
        Action   : 'ProcurementService.rejectRequisition',
        Label    : '{i18n>ActionReject}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}}
      }
    ],

    // Title and document number stacked in one column.
    FieldGroup #Identity: {
      Data: [
        { $Type: 'UI.DataField', Value: title },
        { $Type: 'UI.DataField', Value: requisitionNumber }
      ]
    },

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
      Title: '{i18n>TotalNetValue}'
    },
    DataPoint #Status: {
      $Type      : 'UI.DataPointType',
      Value      : status_code,
      Title      : '{i18n>Status}',
      Criticality: status.criticality
    },
    DataPoint #Risk: {
      $Type      : 'UI.DataPointType',
      Value      : supplierRiskClass_code,
      Title      : '{i18n>SupplierRiskClass}',
      Criticality: supplierRiskClass.criticality
    },
    // How many of the required levels have already signed off.
    DataPoint #ApprovalProgress: {
      $Type        : 'UI.DataPointType',
      Value        : currentApprovalLevel,
      Title        : '{i18n>ApprovedLevels}',
      TargetValue  : requiredApprovalLevel_code,
      Visualization: #Progress
    },

    // Object page layout
    Facets: [
      {
        $Type : 'UI.CollectionFacet',
        ID    : 'GeneralFacet',
        Label : '{i18n>GeneralInformation}',
        Facets: [
          { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#General', ID: 'fgGeneral', Label: '{i18n>Header}' },
          { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Approval', ID: 'fgApproval', Label: '{i18n>Approval}' }
        ]
      },
      {
        $Type : 'UI.ReferenceFacet',
        ID    : 'ItemsFacet',
        Label : '{i18n>Items}',
        Target: 'items/@UI.LineItem'
      },
      {
        $Type : 'UI.ReferenceFacet',
        ID    : 'ApprovalFacet',
        Label : '{i18n>ApprovalChain}',
        Target: 'approvalSteps/@UI.LineItem'
      },
      {
        $Type : 'UI.ReferenceFacet',
        ID    : 'HistoryFacet',
        Label : '{i18n>History}',
        Target: 'events/@UI.LineItem'
      }
    ],

    FieldGroup #General: {
      Data: [
        { $Type: 'UI.DataField', Value: requisitionNumber },
        { $Type: 'UI.DataField', Value: title },
        { $Type: 'UI.DataField', Value: description },
        { $Type: 'UI.DataField', Value: requester },
        { $Type: 'UI.DataField', Value: costCenter_ID },
        { $Type: 'UI.DataField', Value: currency_code, Label: '{i18n>Currency}' }
      ]
    },

    FieldGroup #Approval: {
      Data: [
        { $Type: 'UI.DataField', Value: status_code, Criticality: status.criticality },
        { $Type: 'UI.DataField', Value: supplierRiskClass_code, Criticality: supplierRiskClass.criticality },
        { $Type: 'UI.DataField', Value: requiredApprovalLevel_code },
        { $Type: 'UI.DataField', Value: currentApprovalLevel },
        { $Type: 'UI.DataField', Value: submittedAt },
        { $Type: 'UI.DataField', Value: completedAt },
        {
          $Type        : 'UI.DataField',
          Value        : purchaseOrderNumbers,
          ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'CL']}}
        },
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
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.submit', Label: '{i18n>ActionSubmitForApproval}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'DR']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.approve', Label: '{i18n>ActionApprove}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.rejectRequisition', Label: '{i18n>ActionReject}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.withdraw', Label: '{i18n>ActionWithdraw}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'IA']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.close', Label: '{i18n>ActionCreatePurchaseOrder}', Criticality: #Positive,
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'AP']}} },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.reopen', Label: '{i18n>ActionRework}',
        ![@UI.Hidden]: {$edmJson: {$Ne: [{$Path: 'status_code'}, 'RE']}} }
    ]
  }
);

// Tabs above the list: one per stage of the lifecycle, with record counts.
// The manifest lists them under `views`; the filter itself lives here.
annotate service.PurchaseRequisitions with @(
  UI.SelectionPresentationVariant #all: {
    Text               : '{i18n>ViewAll}',
    SelectionVariant   : { SelectOptions: [] },
    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: createdAt, Descending: true } ]
    }
  },
  UI.SelectionPresentationVariant #draft: {
    Text            : '{i18n>ViewDraft}',
    SelectionVariant: { SelectOptions: [ {
      PropertyName: status_code,
      Ranges      : [ { Sign: #I, Option: #EQ, Low: 'DR' } ]
    } ] },
    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: createdAt, Descending: true } ]
    }
  },
  UI.SelectionPresentationVariant #inApproval: {
    Text            : '{i18n>ViewInApproval}',
    SelectionVariant: { SelectOptions: [ {
      PropertyName: status_code,
      Ranges      : [ { Sign: #I, Option: #EQ, Low: 'IA' } ]
    } ] },
    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: createdAt, Descending: true } ]
    }
  },
  UI.SelectionPresentationVariant #done: {
    Text            : '{i18n>ViewDone}',
    SelectionVariant: { SelectOptions: [ {
      PropertyName: status_code,
      Ranges      : [
        { Sign: #I, Option: #EQ, Low: 'AP' },
        { Sign: #I, Option: #EQ, Low: 'RE' },
        { Sign: #I, Option: #EQ, Low: 'CL' }
      ]
    } ] },
    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: createdAt, Descending: true } ]
    }
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

// Field level labels and value helps. Associations keyed by a UUID show only
// their text - the key is technical and means nothing to a user.
annotate service.PurchaseRequisitions with {
  requisitionNumber @title: '{i18n>RequisitionNumber}' @Common.FieldControl: #ReadOnly;
  title             @title: '{i18n>Title}';
  description       @title: '{i18n>Description}' @UI.MultiLineText;
  requester         @title: '{i18n>Requester}';
  totalValue        @title: '{i18n>TotalNetValue}' @Measures.ISOCurrency: currency_code;
  currentApprovalLevel @title: '{i18n>ApprovedUpToLevel}' @Common.FieldControl: #ReadOnly;
  submittedAt       @title: '{i18n>SubmittedAt}' @Common.FieldControl: #ReadOnly;
  completedAt       @title: '{i18n>CompletedAt}' @Common.FieldControl: #ReadOnly;
  rejectionReason   @title: '{i18n>RejectionReason}' @UI.MultiLineText @Common.FieldControl: #ReadOnly;
  purchaseOrderNumbers @title: '{i18n>PurchaseOrdersS4}' @Common.FieldControl: #ReadOnly;
  pendingApprovalLevel @UI.Hidden;

  // Code list fields show their localized text, never the bare code, and
  // offer a dropdown in the filter bar.
  status @(
    title: '{i18n>Status}',
    Common: {
      Text                    : status.name,
      TextArrangement         : #TextOnly,
      ValueListWithFixedValues: true,
      ValueList: {
        CollectionPath: 'RequisitionStatuses',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status_code, ValueListProperty: 'code' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
      }
    }
  );

  supplierRiskClass @(
    title: '{i18n>SupplierRisk}',
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

  requiredApprovalLevel @(
    title: '{i18n>RequiredApprovalLevel}',
    Common: {
      Text                    : requiredApprovalLevel.name,
      TextArrangement         : #TextOnly,
      ValueListWithFixedValues: true,
      ValueList: {
        CollectionPath: 'ApprovalLevels',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: requiredApprovalLevel_code, ValueListProperty: 'code' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
      }
    }
  );

  costCenter @(
    title: '{i18n>CostCenter}',
    Common: {
      Text           : costCenter.name,
      TextArrangement: #TextOnly,
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

// Value list entities: the dropdown shows the text, the key stays hidden.
annotate service.RequisitionStatuses with {
  code @title: '{i18n>Status}' @Common.Text: name @Common.TextArrangement: #TextOnly;
};
annotate service.RiskClasses with {
  code @title: '{i18n>RiskClass}' @Common.Text: name @Common.TextArrangement: #TextOnly;
};
annotate service.ApprovalLevels with {
  code @title: '{i18n>ApprovalLevel}' @Common.Text: name @Common.TextArrangement: #TextOnly;
};
annotate service.ApprovalDecisions with {
  code @title: '{i18n>Decision}' @Common.Text: name @Common.TextArrangement: #TextOnly;
};

annotate service.CostCenters with {
  ID             @Common.Text: name @Common.TextArrangement: #TextOnly @UI.HiddenFilter;
  costCenterCode @title: '{i18n>CostCenterCode}';
  name           @title: '{i18n>Name}';
  responsible    @title: '{i18n>Responsible}';
};

// ====================================================================
// Items
// ====================================================================
annotate service.PurchaseRequisitionItems with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : '{i18n>Item}',
      TypeNamePlural: '{i18n>Items}',
      Title         : { $Type: 'UI.DataField', Value: description },
      Description   : { $Type: 'UI.DataField', Value: itemNumber }
    },
    LineItem: [
      { $Type: 'UI.DataField', Value: itemNumber },
      { $Type: 'UI.DataField', Value: material_ID },
      { $Type: 'UI.DataField', Value: description, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: quantity },
      { $Type: 'UI.DataField', Value: unitPrice },
      { $Type: 'UI.DataField', Value: netAmount, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: supplier_ID },
      { $Type: 'UI.DataField', Value: deliveryDate },
      { $Type: 'UI.DataField', Value: purchaseOrderNumber }
    ],
    Facets: [
      { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#ItemDetails', ID: 'fgItem', Label: '{i18n>ItemDetails}' }
    ],
    FieldGroup #ItemDetails: {
      Data: [
        { $Type: 'UI.DataField', Value: itemNumber },
        { $Type: 'UI.DataField', Value: material_ID },
        { $Type: 'UI.DataField', Value: description },
        { $Type: 'UI.DataField', Value: quantity },
        { $Type: 'UI.DataField', Value: unit },
        { $Type: 'UI.DataField', Value: unitPrice },
        { $Type: 'UI.DataField', Value: netAmount },
        { $Type: 'UI.DataField', Value: supplier_ID },
        { $Type: 'UI.DataField', Value: plant_ID },
        { $Type: 'UI.DataField', Value: deliveryDate },
        { $Type: 'UI.DataField', Value: purchaseOrderNumber },
        { $Type: 'UI.DataField', Value: purchaseOrderItem }
      ]
    }
  }
);

// Picking a material defaults the description, the unit and the price, and
// changing quantity or price recalculates the net amount - all server side,
// implemented by deriveItemFields() in srv/procurement-service.ts.
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
  itemNumber   @title: '{i18n>ItemNumber}' @Common.FieldControl: #ReadOnly;
  description  @title: '{i18n>Description}';
  quantity     @title: '{i18n>Quantity}' @Measures.Unit: unit;
  unit         @title: '{i18n>Unit}';
  unitPrice    @title: '{i18n>UnitPrice}' @Measures.ISOCurrency: currency_code;
  netAmount    @title: '{i18n>NetAmount}' @Measures.ISOCurrency: currency_code @Common.FieldControl: #ReadOnly;
  deliveryDate @title: '{i18n>DeliveryDate}';
  purchaseOrderNumber @title: '{i18n>PurchaseOrderS4}' @Common.FieldControl: #ReadOnly;
  purchaseOrderItem   @title: '{i18n>PurchaseOrderItem}' @Common.FieldControl: #ReadOnly;

  material @(
    title: '{i18n>Material}',
    Common: {
      Text           : material.description,
      TextArrangement: #TextOnly,
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
    title: '{i18n>Supplier}',
    Common: {
      Text           : supplier.name,
      TextArrangement: #TextOnly,
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
    title: '{i18n>Plant}',
    Common: {
      Text           : plant.name,
      TextArrangement: #TextOnly,
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

annotate service.Materials with {
  ID             @Common.Text: description @Common.TextArrangement: #TextOnly @UI.HiddenFilter;
  materialNumber @title: '{i18n>MaterialNumber}';
  description    @title: '{i18n>Description}';
  baseUnit       @title: '{i18n>Unit}';
  standardPrice  @title: '{i18n>StandardPrice}' @Measures.ISOCurrency: currency_code;
};

annotate service.Plants with {
  ID        @Common.Text: name @Common.TextArrangement: #TextOnly @UI.HiddenFilter;
  plantCode @title: '{i18n>Plant}';
  name      @title: '{i18n>Name}';
};

// ====================================================================
// Approval chain
// ====================================================================
annotate service.ApprovalSteps with @(
  UI: {
    LineItem: [
      { $Type: 'UI.DataField', Value: level_code },
      { $Type: 'UI.DataField', Value: decision_code, Criticality: decision.criticality, CriticalityRepresentation: #WithIcon },
      { $Type: 'UI.DataField', Value: decidedBy },
      { $Type: 'UI.DataField', Value: decidedAt },
      { $Type: 'UI.DataField', Value: comment }
    ],
    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: level_code } ]
    }
  }
);

annotate service.ApprovalSteps with {
  level     @title: '{i18n>ApprovalLevel}' @Common.Text: level.name @Common.TextArrangement: #TextOnly;
  decision  @title: '{i18n>Decision}' @Common.Text: decision.name @Common.TextArrangement: #TextOnly;
  decidedBy @title: '{i18n>DecidedBy}';
  decidedAt @title: '{i18n>DecidedAt}';
  comment   @title: '{i18n>Comment}';
};

// ====================================================================
// Audit trail
// ====================================================================
annotate service.RequisitionEvents with @(
  UI: {
    LineItem: [
      { $Type: 'UI.DataField', Value: occurredAt },
      { $Type: 'UI.DataField', Value: eventType_code, Criticality: eventType.criticality, CriticalityRepresentation: #WithIcon },
      { $Type: 'UI.DataField', Value: approvalLevel },
      { $Type: 'UI.DataField', Value: actor },
      { $Type: 'UI.DataField', Value: note }
    ],
    // Oldest first: a trail is read from the top down.
    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: occurredAt } ]
    }
  }
);

annotate service.RequisitionEvents with {
  occurredAt    @title: '{i18n>OccurredAt}';
  eventType     @title: '{i18n>Event}' @Common.Text: eventType.name @Common.TextArrangement: #TextOnly;
  approvalLevel @title: '{i18n>ApprovalLevel}';
  actor         @title: '{i18n>Actor}';
  note          @title: '{i18n>Note}';
};
