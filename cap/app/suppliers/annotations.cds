using ProcurementService as service from '../../srv/procurement-service';
using ProcurementAnalyticsService as analytics from '../../srv/analytics-service';

// Fiori Elements annotations for the "Supplier Risk" app.
//
// The list report doubles as the worklist a category manager uses after a
// rating change: filter on risk class C, trigger `recalculateRisk`, then walk
// the open exposure in the analytics list.
//
// Texts are i18n keys, resolved per request language from cap/_i18n.

annotate service.Suppliers with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : '{i18n>Supplier}',
      TypeNamePlural: '{i18n>Suppliers}',
      TypeImageUrl  : 'sap-icon://supplier',
      Title         : { $Type: 'UI.DataField', Value: name },
      Description   : { $Type: 'UI.DataField', Value: supplierNumber }
    },

    SelectionFields: [ riskClass_code, country_code, financialRating_code, isBlocked ],

    LineItem: [
      {
        $Type : 'UI.DataFieldForAnnotation',
        Target: '@UI.FieldGroup#Identity',
        Label : '{i18n>Supplier}',
        ![@UI.Importance]: #High
      },
      { $Type: 'UI.DataField', Value: country_code },
      { $Type: 'UI.DataField', Value: financialRating_code },
      {
        $Type : 'UI.DataFieldForAnnotation',
        Target: '@UI.DataPoint#OnTimeDelivery',
        Label : '{i18n>OnTimeDeliveryRate}'
      },
      { $Type: 'UI.DataField', Value: qualityIncidents12M },
      {
        $Type : 'UI.DataFieldForAnnotation',
        Target: '@UI.DataPoint#RiskScore',
        Label : '{i18n>RiskScore}',
        ![@UI.Importance]: #High
      },
      {
        $Type                    : 'UI.DataField',
        Value                    : riskClass_code,
        Criticality              : riskClass.criticality,
        CriticalityRepresentation: #WithIcon,
        ![@UI.Importance]        : #High
      },
      { $Type: 'UI.DataField', Value: isBlocked },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.EntityContainer/syncSuppliersFromS4', Label: '{i18n>ActionSyncFromS4}' },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.updateFinancialRating', Label: '{i18n>ActionUpdateRating}' },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.recalculateRisk', Label: '{i18n>ActionRecalculateRisk}' }
    ],

    FieldGroup #Identity: {
      Data: [
        { $Type: 'UI.DataField', Value: name },
        { $Type: 'UI.DataField', Value: supplierNumber }
      ]
    },

    PresentationVariant: {
      Visualizations: [ '@UI.LineItem' ],
      SortOrder     : [ { Property: riskScore, Descending: true } ]
    },

    HeaderFacets: [
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#RiskScore', ID: 'dpScore' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#RiskClass', ID: 'dpClass' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#OnTimeDelivery', ID: 'dpOnTime' }
    ],

    // Rendered as a progress bar. The thresholds mirror RISK_CLASS_THRESHOLDS
    // in srv/lib/risk-scoring.ts - a score of 25 turns it yellow, 55 red.
    DataPoint #RiskScore: {
      $Type                 : 'UI.DataPointType',
      Value                 : riskScore,
      Title                 : '{i18n>RiskScore}',
      TargetValue           : 100,
      Visualization         : #Progress,
      CriticalityCalculation: {
        $Type                  : 'UI.CriticalityCalculationType',
        ImprovementDirection   : #Minimize,
        DeviationRangeHighValue: 55,
        ToleranceRangeHighValue: 25
      }
    },
    DataPoint #RiskClass: {
      $Type      : 'UI.DataPointType',
      Value      : riskClass_code,
      Title      : '{i18n>RiskClass}',
      Criticality: riskClass.criticality
    },
    // Share of on-time deliveries in percent. Below 85 % it turns yellow, below 70 % red.
    DataPoint #OnTimeDelivery: {
      $Type                 : 'UI.DataPointType',
      Value                 : onTimeDeliveryPercent,
      Title                 : '{i18n>OnTimeDeliveryRate}',
      TargetValue           : 100,
      Visualization         : #Progress,
      CriticalityCalculation: {
        $Type                 : 'UI.CriticalityCalculationType',
        ImprovementDirection  : #Maximize,
        DeviationRangeLowValue: 70,
        ToleranceRangeLowValue: 85
      }
    },

    Facets: [
      { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Master', ID: 'fgMaster', Label: '{i18n>MasterData}' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#RiskIndicators', ID: 'fgRisk', Label: '{i18n>RiskIndicators}' }
    ],

    FieldGroup #Master: {
      Data: [
        { $Type: 'UI.DataField', Value: supplierNumber },
        { $Type: 'UI.DataField', Value: name },
        { $Type: 'UI.DataField', Value: country_code },
        { $Type: 'UI.DataField', Value: isBlocked },
        { $Type: 'UI.DataField', Value: s4SyncedAt }
      ]
    },

    FieldGroup #RiskIndicators: {
      Data: [
        { $Type: 'UI.DataField', Value: financialRating_code },
        { $Type: 'UI.DataField', Value: onTimeDeliveryPercent },
        { $Type: 'UI.DataField', Value: qualityIncidents12M },
        { $Type: 'UI.DataField', Value: isoCertified },
        { $Type: 'UI.DataField', Value: riskScore },
        { $Type: 'UI.DataField', Value: riskClass_code, Criticality: riskClass.criticality },
        { $Type: 'UI.DataField', Value: riskCalculatedAt }
      ]
    },

    Identification: [
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.updateFinancialRating', Label: '{i18n>ActionUpdateRating}' },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.recalculateRisk', Label: '{i18n>ActionRecalculateRisk}' }
    ]
  }
);

// Recalculating the score changes the class, the timestamp and the colour.
annotate service.Suppliers with @(
  Common.SideEffects #riskRecalculated: {
    TargetProperties: [ 'riskScore', 'riskClass_code', 'riskCalculatedAt', 'riskScoreCriticality', 'financialRating_code' ]
  }
);

// After a sync the whole list may have changed (new suppliers, blocks).
annotate service.syncSuppliersFromS4 with @(
  Common.SideEffects: { TargetEntities: [ '/ProcurementService.EntityContainer/Suppliers' ] }
);

annotate service.Suppliers with {
  supplierNumber       @title: '{i18n>SupplierNumber}';
  name                 @title: '{i18n>Name}';
  isBlocked            @title: '{i18n>PurchasingBlock}';
  onTimeDeliveryRate   @title: '{i18n>OnTimeDeliveryRate}';
  qualityIncidents12M  @title: '{i18n>QualityIncidents12M}';
  isoCertified         @title: '{i18n>IsoCertified}';
  riskScore            @title: '{i18n>RiskScore}' @Common.FieldControl: #ReadOnly;
  riskCalculatedAt     @title: '{i18n>RiskCalculatedAt}' @Common.FieldControl: #ReadOnly;
  s4SyncedAt           @title: '{i18n>S4SyncedAt}' @Common.FieldControl: #ReadOnly;
  riskScoreCriticality @UI.Hidden;
  onTimeDeliveryPercent @title: '{i18n>OnTimeDeliveryRate}' @Measures.Unit: '%' @UI.HiddenFilter;

  country @(
    title: '{i18n>Country}',
    Common: {
      Text                    : country.name,
      TextArrangement         : #TextFirst,
      ValueListWithFixedValues: true
    }
  );

  riskClass @(
    title: '{i18n>RiskClass}',
    Common: {
      Text                    : riskClass.name,
      TextArrangement         : #TextOnly,
      ValueListWithFixedValues: true,
      ValueList: {
        CollectionPath: 'RiskClasses',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: riskClass_code, ValueListProperty: 'code' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
      }
    }
  );

  financialRating @(
    title: '{i18n>FinancialRating}',
    Common: {
      ValueListWithFixedValues: true,
      ValueList: {
        CollectionPath: 'FinancialRatings',
        Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: financialRating_code, ValueListProperty: 'code' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'descr' }
        ]
      }
    }
  );
};

annotate service.FinancialRatings with {
  code  @title: '{i18n>FinancialRating}';
  descr @title: '{i18n>Description}';
};

// ====================================================================
// Analytics
// ====================================================================
annotate analytics.SupplierRiskExposure with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : '{i18n>SupplierExposure}',
      TypeNamePlural: '{i18n>SupplierExposure}',
      Title         : { $Type: 'UI.DataField', Value: supplierName }
    },
    SelectionFields: [ riskClass, country ],
    LineItem: [
      { $Type: 'UI.DataField', Value: supplierNumber, Label: '{i18n>Supplier}' },
      { $Type: 'UI.DataField', Value: supplierName, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: country, Label: '{i18n>Country}' },
      { $Type: 'UI.DataField', Value: riskScore, Label: '{i18n>RiskScore}' },
      { $Type: 'UI.DataField', Value: riskClass, Label: '{i18n>RiskClass}' },
      { $Type: 'UI.DataField', Value: openVolume, Label: '{i18n>OpenVolume}', ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: itemCount, Label: '{i18n>Items}' }
    ]
  }
);

annotate analytics.SpendByMaterialGroup with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : '{i18n>RequestedVolume}',
      TypeNamePlural: '{i18n>RequestedVolume}',
      Title         : { $Type: 'UI.DataField', Value: materialGroup }
    },
    SelectionFields: [ statusCode ],
    LineItem: [
      { $Type: 'UI.DataField', Value: materialGroupCode, Label: '{i18n>MaterialGroup}' },
      { $Type: 'UI.DataField', Value: materialGroup, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: status, Label: '{i18n>Status}' },
      { $Type: 'UI.DataField', Value: requestedVolume, Label: '{i18n>RequestedVolume}', ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: itemCount, Label: '{i18n>Items}' }
    ]
  }
);
