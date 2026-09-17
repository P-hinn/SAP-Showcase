/**
 * S/4HANA Cloud: Purchase Order (A2X), OData V2.
 * https://api.sap.com/api/API_PURCHASEORDER_PROCESS_SRV
 *
 * Subset of the published service - the header and item fields needed to
 * create a purchase order from an approved requisition. Field names and types
 * follow the SAP API Business Hub definition.
 *
 * Locally the service is mocked (cds serve --with-mocks); the mock assigns
 * purchase order numbers the way S/4HANA does, see
 * API_PURCHASEORDER_PROCESS_SRV.ts. The SAP API Business Hub sandbox is read
 * only, so creating an order needs a real or trial S/4HANA system.
 */
@cds.external: true
@cds.persistence.skip: false
service API_PURCHASEORDER_PROCESS_SRV {

  entity A_PurchaseOrder {
    key PurchaseOrder          : String(10);
        CompanyCode            : String(4);
        PurchaseOrderType      : String(4);
        PurchasingOrganization : String(4);
        PurchasingGroup        : String(3);
        Supplier               : String(10);
        DocumentCurrency       : String(5);
        PurchaseOrderDate      : Date;
        CreatedByUser          : String(12);
        to_PurchaseOrderItem   : Composition of many A_PurchaseOrderItem
                                   on to_PurchaseOrderItem.PurchaseOrder = PurchaseOrder;
  }

  entity A_PurchaseOrderItem {
    key PurchaseOrder             : String(10);
    key PurchaseOrderItem         : String(5);
        PurchaseOrderItemText     : String(40);
        Material                  : String(40);
        Plant                     : String(4);
        OrderQuantity             : Decimal(13, 3);
        PurchaseOrderQuantityUnit : String(3);
        NetPriceAmount            : Decimal(16, 3);
        DocumentCurrency          : String(5);
        /** Link back to the requisition this item came from (free text in this demo). */
        RequisitionerName         : String(12);
  }
}
