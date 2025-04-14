@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase requisition item - consumption view'
@Metadata.allowExtensions: true
define view entity ZC_PR_ReqItem
  as projection on ZI_PR_ReqItem
{
  key ItemUUID,

      RequisitionUUID,
      ItemNumber,

      @Consumption.valueHelpDefinition: [{ entity: { name: 'I_ProductStdVH', element: 'Product' } }]
      Product,
      Description,

      @Semantics.quantity.unitOfMeasure: 'QuantityUnit'
      Quantity,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'I_UnitOfMeasureStdVH', element: 'UnitOfMeasure' } }]
      QuantityUnit,

      @Semantics.amount.currencyCode: 'Currency'
      UnitPrice,
      @Semantics.amount.currencyCode: 'Currency'
      NetAmount,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'I_CurrencyStdVH', element: 'Currency' } }]
      Currency,

      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_PR_Supplier', element: 'Supplier' },
                                           additionalBinding: [{ localElement: 'Currency',
                                                                 element: 'Currency',
                                                                 usage: #FILTER_AND_RESULT }] }]
      Supplier,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'I_PlantStdVH', element: 'Plant' } }]
      Plant,
      DeliveryDate,

      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChangedAt,

      _Requisition : redirected to parent ZC_PR_Requisition,
      _Supplier
}
