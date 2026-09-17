@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase requisition item - interface view'
@Metadata.ignorePropagatedAnnotations: true
@ObjectModel.usageType: {
  serviceQuality: #X_LARGE,
  sizeCategory: #S,
  dataClass: #TRANSACTIONAL
}
define view entity ZI_PR_ReqItem
  as select from zpr_req_itm
  association to parent ZI_PR_Requisition as _Requisition
    on $projection.RequisitionUUID = _Requisition.RequisitionUUID
  association [0..1] to ZI_PR_Supplier    as _Supplier
    on $projection.Supplier = _Supplier.Supplier
{
  key item_uuid             as ItemUUID,

      requisition_uuid      as RequisitionUUID,
      item_number           as ItemNumber,
      product               as Product,
      description           as Description,

      @Semantics.quantity.unitOfMeasure: 'QuantityUnit'
      quantity              as Quantity,
      quantity_unit         as QuantityUnit,

      @Semantics.amount.currencyCode: 'Currency'
      unit_price            as UnitPrice,
      @Semantics.amount.currencyCode: 'Currency'
      net_amount            as NetAmount,
      currency              as Currency,

      supplier              as Supplier,
      plant                 as Plant,
      delivery_date         as DeliveryDate,

      @Semantics.user.createdBy: true
      created_by            as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at            as CreatedAt,
      @Semantics.user.lastChangedBy: true
      last_changed_by       as LastChangedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at       as LastChangedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at as LocalLastChangedAt,

      _Requisition,
      _Supplier
}
