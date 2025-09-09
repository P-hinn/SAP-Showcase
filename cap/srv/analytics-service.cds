using { acme.procurement as db } from '../db/schema';

/**
 * Read-only reporting service.
 *
 * Every entity here is a pure CDS view: the aggregation runs in the database,
 * not in Node.js. This is the same modelling discipline as an ABAP CDS
 * analytical view - push the work down to the data, expose a flat result.
 */
@path: '/analytics'
@requires: 'authenticated-user'
service ProcurementAnalyticsService {

  /** Requested volume per material group, split by requisition status. */
  @readonly
  @Aggregation.ApplySupported.PropertyRestrictions: true
  entity SpendByMaterialGroup as
    select from db.PurchaseRequisitionItems {
      key material.materialGroup.groupCode as materialGroupCode : String(9),
      key requisition.status.code          as statusCode        : String(2),
          material.materialGroup.name      as materialGroup     : String(80),
          requisition.status.name          as status            : String(255),
          sum(netAmount)                   as requestedVolume   : Decimal(15, 2),
          count(1)                         as itemCount         : Integer
    }
    group by
      material.materialGroup.groupCode,
      material.materialGroup.name,
      requisition.status.code,
      requisition.status.name;

  /**
   * Open commitment per supplier, i.e. everything that is in approval or
   * already approved but not yet closed. This is the list a category manager
   * looks at when a supplier is downgraded.
   */
  @readonly
  entity SupplierRiskExposure as
    select from db.PurchaseRequisitionItems {
      key supplier.supplierNumber as supplierNumber : String(10),
          supplier.name           as supplierName   : String(80),
          supplier.riskScore      as riskScore      : Integer,
          supplier.riskClass.code as riskClass      : String(1),
          supplier.country.code   as country        : String(2),
          sum(netAmount)          as openVolume     : Decimal(15, 2),
          count(1)                as itemCount      : Integer
    }
    where
      requisition.status.code in ('IA', 'AP')
    group by
      supplier.supplierNumber,
      supplier.name,
      supplier.riskScore,
      supplier.riskClass.code,
      supplier.country.code;

  /** Budget utilisation per cost center, incl. the derived remaining budget. */
  @readonly
  entity CostCenterBudget as
    select from db.CostCenters {
      key costCenterCode,
          name,
          responsible,
          annualBudget,
          consumedBudget,
          annualBudget - consumedBudget as remainingBudget : Decimal(15, 2),
          currency
    };
}
