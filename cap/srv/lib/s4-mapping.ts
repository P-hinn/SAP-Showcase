/**
 * Mapping between this application and the S/4HANA A2X APIs.
 *
 * Pure functions only, like the rule modules next to it: what goes into a
 * purchase order and what a supplier sync changes is decided here and tested
 * without a database or a remote system. The service handler does the calls.
 */

/** Organisational data the purchase orders are created in (SAP Best Practices company code 1010). */
export const PURCHASING_ORG_DATA = {
  CompanyCode: '1010',
  PurchaseOrderType: 'NB',
  PurchasingOrganization: '1010',
  PurchasingGroup: '001'
} as const;

// ------------------------------------------------------------------ suppliers

/** A_Supplier as far as it is read (API_BUSINESS_PARTNER). */
export interface A_Supplier {
  Supplier: string;
  SupplierName?: string | null;
  PurchasingIsBlocked?: boolean | null;
}

/** A_BusinessPartnerAddress as far as it is read. */
export interface A_BusinessPartnerAddress {
  BusinessPartner: string;
  Country?: string | null;
}

/** A supplier as S/4HANA sees it, flattened. */
export interface RemoteSupplier {
  supplierNumber: string;
  name: string;
  country_code: string | null;
  isBlocked: boolean;
}

/** The fields of a local supplier that S/4HANA owns. */
export interface LocalSupplier {
  ID?: string;
  supplierNumber: string;
  name?: string | null;
  country_code?: string | null;
  isBlocked?: boolean | null;
}

/** Joins suppliers with the country of their first address. */
export function toRemoteSuppliers(
  suppliers: readonly A_Supplier[],
  addresses: readonly A_BusinessPartnerAddress[]
): RemoteSupplier[] {
  const countryOf = new Map<string, string>();
  for (const address of addresses) {
    if (address.Country && !countryOf.has(address.BusinessPartner)) {
      countryOf.set(address.BusinessPartner, address.Country);
    }
  }
  return suppliers
    .filter((supplier) => supplier.Supplier)
    .map((supplier) => ({
      supplierNumber: String(supplier.Supplier),
      name: String(supplier.SupplierName ?? supplier.Supplier),
      country_code: countryOf.get(supplier.Supplier) ?? null,
      isBlocked: supplier.PurchasingIsBlocked === true
    }));
}

export interface SupplierSyncPlan {
  create: RemoteSupplier[];
  update: Array<{ ID: string; changes: Partial<RemoteSupplier> }>;
  /** IDs of local suppliers that are already up to date. */
  unchanged: string[];
}

/**
 * Decides what a sync changes. S/4HANA wins for name, country and purchasing
 * block; a country this application does not know is not taken over (the
 * risk model has no country risk for it) but does not stop the rest.
 * Local suppliers that S/4HANA does not return are left alone - a missing row
 * in a paged read is not a deletion.
 */
export function planSupplierSync(
  remote: readonly RemoteSupplier[],
  local: ReadonlyArray<LocalSupplier & { ID: string }>,
  knownCountries: ReadonlySet<string>
): SupplierSyncPlan {
  const byNumber = new Map(local.map((supplier) => [supplier.supplierNumber, supplier]));
  const plan: SupplierSyncPlan = { create: [], update: [], unchanged: [] };

  for (const incoming of remote) {
    const country = incoming.country_code && knownCountries.has(incoming.country_code) ? incoming.country_code : null;
    const existing = byNumber.get(incoming.supplierNumber);

    if (!existing) {
      plan.create.push({ ...incoming, country_code: country });
      continue;
    }

    const changes: Partial<RemoteSupplier> = {};
    if (incoming.name !== existing.name) changes.name = incoming.name;
    if (country && country !== existing.country_code) changes.country_code = country;
    if (incoming.isBlocked !== Boolean(existing.isBlocked)) changes.isBlocked = incoming.isBlocked;

    if (Object.keys(changes).length) plan.update.push({ ID: existing.ID, changes });
    else plan.unchanged.push(existing.ID);
  }

  return plan;
}

// ------------------------------------------------------------ purchase orders

/** An approved requisition item with the master data the order needs. */
export interface OrderableItem {
  ID: string;
  description?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unitPrice?: number | string | null;
  currency_code?: string | null;
  material?: { materialNumber?: string | null } | null;
  plant?: { plantCode?: string | null } | null;
  supplier?: { supplierNumber?: string | null } | null;
}

export interface PurchaseOrderDraft {
  /** Requisition item IDs, in the order of the purchase order items. */
  itemIds: string[];
  payload: {
    PurchaseOrder?: string;
    Supplier: string;
    DocumentCurrency: string;
    PurchaseOrderDate: string;
    to_PurchaseOrderItem: Array<Record<string, string | number | null>>;
  } & typeof PURCHASING_ORG_DATA;
}

/** S/4HANA item numbers: 00010, 00020, ... */
export function itemNumber(index: number): string {
  return String((index + 1) * 10).padStart(5, '0');
}

/**
 * Splits a requisition into purchase orders, one per supplier, keeping the
 * item order of the requisition. Texts are cut to the length S/4HANA accepts.
 */
export function purchaseOrdersFor(
  requisition: { requisitionNumber?: string | null; requester?: string | null; currency?: string | null },
  items: readonly OrderableItem[],
  orderDate: string
): PurchaseOrderDraft[] {
  const bySupplier = new Map<string, OrderableItem[]>();
  for (const item of items) {
    const supplier = item.supplier?.supplierNumber;
    if (!supplier) continue;
    const list = bySupplier.get(supplier) ?? [];
    list.push(item);
    bySupplier.set(supplier, list);
  }

  return [...bySupplier.entries()].map(([supplier, own]) => {
    const currency = own[0]?.currency_code ?? requisition.currency ?? 'EUR';
    return {
      itemIds: own.map((item) => item.ID),
      payload: {
        ...PURCHASING_ORG_DATA,
        Supplier: supplier,
        DocumentCurrency: currency,
        PurchaseOrderDate: orderDate,
        to_PurchaseOrderItem: own.map((item, index) => ({
          PurchaseOrderItem: itemNumber(index),
          PurchaseOrderItemText: String(item.description ?? '').slice(0, 40),
          Material: item.material?.materialNumber ?? null,
          Plant: item.plant?.plantCode ?? null,
          OrderQuantity: Number(item.quantity ?? 0),
          PurchaseOrderQuantityUnit: item.unit ?? null,
          NetPriceAmount: Number(item.unitPrice ?? 0),
          DocumentCurrency: item.currency_code ?? currency,
          RequisitionerName: String(requisition.requester ?? '').slice(0, 12)
        }))
      }
    };
  });
}
