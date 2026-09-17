using ProcurementService as service from '../../srv/procurement-service';
using ProcurementAnalyticsService as analytics from '../../srv/analytics-service';

// Fiori Elements annotations for the "Supplier Risk" app.
//
// The list report doubles as the worklist a category manager uses after a
// rating change: filter on risk class C, trigger `recalculateRisk`, then walk
// the open exposure in the analytics list.

annotate service.Suppliers with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : 'Supplier',
      TypeNamePlural: 'Suppliers',
      Title         : { $Type: 'UI.DataField', Value: name },
      Description   : { $Type: 'UI.DataField', Value: supplierNumber }
    },

    SelectionFields: [ riskClass_code, country_code, financialRating_code, isBlocked ],

    LineItem: [
      { $Type: 'UI.DataField', Value: supplierNumber, Label: 'Supplier' },
      { $Type: 'UI.DataField', Value: name, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: country_code, Label: 'Country' },
      { $Type: 'UI.DataField', Value: financialRating_code, Label: 'Rating' },
      { $Type: 'UI.DataField', Value: onTimeDeliveryRate, Label: 'On Time Delivery' },
      { $Type: 'UI.DataField', Value: qualityIncidents12M, Label: 'Quality Incidents 12M' },
      {
        $Type      : 'UI.DataField',
        Value      : riskScore,
        Criticality: riskScoreCriticality,
        Label      : 'Risk Score',
        ![@UI.Importance]: #High
      },
      { $Type: 'UI.DataField', Value: riskClass_code, Criticality: riskClass.criticality, Label: 'Risk Class' },
      { $Type: 'UI.DataField', Value: isBlocked, Criticality: #Negative, Label: 'Blocked' },
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.recalculateRisk', Label: 'Recalculate Risk' }
    ],

    HeaderFacets: [
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#RiskScore', ID: 'dpScore' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#RiskClass', ID: 'dpClass' }
    ],

    // Rendered as a gauge. The thresholds mirror RISK_CLASS_THRESHOLDS in
    // srv/lib/risk-scoring.js - a score of 25 turns the gauge yellow, 55 red.
    DataPoint #RiskScore: {
      $Type                 : 'UI.DataPointType',
      Value                 : riskScore,
      Title                 : 'Risk Score',
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
      Title      : 'Risk Class',
      Criticality: riskClass.criticality
    },

    Facets: [
      { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Master', ID: 'fgMaster', Label: 'Master Data' },
      { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#RiskIndicators', ID: 'fgRisk', Label: 'Risk Indicators' }
    ],

    FieldGroup #Master: {
      Data: [
        { $Type: 'UI.DataField', Value: supplierNumber },
        { $Type: 'UI.DataField', Value: name },
        { $Type: 'UI.DataField', Value: country_code, Label: 'Country' },
        { $Type: 'UI.DataField', Value: isBlocked, Criticality: #Negative }
      ]
    },

    FieldGroup #RiskIndicators: {
      Data: [
        { $Type: 'UI.DataField', Value: financialRating_code, Label: 'Financial Rating' },
        { $Type: 'UI.DataField', Value: onTimeDeliveryRate },
        { $Type: 'UI.DataField', Value: qualityIncidents12M },
        { $Type: 'UI.DataField', Value: isoCertified },
        { $Type: 'UI.DataField', Value: riskScore },
        { $Type: 'UI.DataField', Value: riskClass_code, Criticality: riskClass.criticality },
        { $Type: 'UI.DataField', Value: riskCalculatedAt }
      ]
    },

    Identification: [
      { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.recalculateRisk', Label: 'Recalculate Risk' }
    ]
  }
);

// Recalculating the score changes the class, the timestamp and the colour.
annotate service.Suppliers with @(
  Common.SideEffects #riskRecalculated: {
    TargetProperties: [ 'riskScore', 'riskClass_code', 'riskCalculatedAt', 'riskScoreCriticality' ]
  }
);

annotate service.Suppliers with {
  supplierNumber       @title: 'Supplier Number';
  name                 @title: 'Name';
  isBlocked            @title: 'Purchasing Block';
  onTimeDeliveryRate   @title: 'On Time Delivery Rate';
  qualityIncidents12M  @title: 'Quality Incidents (12 Months)';
  isoCertified         @title: 'ISO 9001 Certified';
  riskScore            @title: 'Risk Score' @Common.FieldControl: #ReadOnly;
  riskCalculatedAt     @title: 'Risk Calculated At' @Common.FieldControl: #ReadOnly;
  riskScoreCriticality @UI.Hidden;
};

// ====================================================================
// Analytics
// ====================================================================
annotate analytics.SupplierRiskExposure with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : 'Supplier Exposure',
      TypeNamePlural: 'Supplier Exposure',
      Title         : { $Type: 'UI.DataField', Value: supplierName }
    },
    SelectionFields: [ riskClass, country ],
    LineItem: [
      { $Type: 'UI.DataField', Value: supplierNumber, Label: 'Supplier' },
      { $Type: 'UI.DataField', Value: supplierName, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: country, Label: 'Country' },
      { $Type: 'UI.DataField', Value: riskScore, Label: 'Risk Score' },
      { $Type: 'UI.DataField', Value: riskClass, Label: 'Risk Class' },
      { $Type: 'UI.DataField', Value: openVolume, Label: 'Open Volume', ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: itemCount, Label: 'Items' }
    ]
  }
);

annotate analytics.SpendByMaterialGroup with @(
  UI: {
    HeaderInfo: {
      $Type         : 'UI.HeaderInfoType',
      TypeName      : 'Requested Volume',
      TypeNamePlural: 'Requested Volume',
      Title         : { $Type: 'UI.DataField', Value: materialGroup }
    },
    SelectionFields: [ statusCode ],
    LineItem: [
      { $Type: 'UI.DataField', Value: materialGroupCode, Label: 'Material Group' },
      { $Type: 'UI.DataField', Value: materialGroup, ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: status, Label: 'Status' },
      { $Type: 'UI.DataField', Value: requestedVolume, Label: 'Requested Volume', ![@UI.Importance]: #High },
      { $Type: 'UI.DataField', Value: itemCount, Label: 'Items' }
    ]
  }
);
