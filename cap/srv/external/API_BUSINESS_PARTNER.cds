/**
 * S/4HANA Cloud: Business Partner (A2X), OData V2.
 * https://api.sap.com/api/API_BUSINESS_PARTNER
 *
 * A deliberately small subset of the published service: only the entities and
 * fields this extension reads. Names and types follow the SAP API Business Hub
 * definition, so the same queries run against a real system or the sandbox.
 * The complete model can be generated with
 *   cds import API_BUSINESS_PARTNER.edmx --as cds
 * once the EDMX has been downloaded from the API Business Hub.
 *
 * Locally the service is mocked from ./data (cds serve --with-mocks).
 */
@cds.external: true
@cds.persistence.skip: false
service API_BUSINESS_PARTNER {

  /** Supplier role of a business partner. The supplier number is the BP number. */
  entity A_Supplier {
    key Supplier            : String(10);
        SupplierName        : String(80);
        SupplierFullName    : String(220);
        /** Central purchasing block. */
        PurchasingIsBlocked : Boolean;
        /** Central posting block. */
        PostingIsBlocked    : Boolean;
        CreationDate        : Date;
  }

  /** Addresses of a business partner. The supplier's country lives here, not on A_Supplier. */
  entity A_BusinessPartnerAddress {
    key BusinessPartner : String(10);
    key AddressID       : String(10);
        Country         : String(3);
        CityName        : String(40);
        PostalCode      : String(10);
        StreetName      : String(60);
  }
}
