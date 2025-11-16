import { itemNumber, planSupplierSync, purchaseOrdersFor, toRemoteSuppliers } from '../srv/lib/s4-mapping';

describe('S/4HANA mapping', () => {

  describe('toRemoteSuppliers', () => {
    it('takes the country from the first address and reads a missing block as not blocked', () => {
      const result = toRemoteSuppliers(
        [{ Supplier: '1', SupplierName: 'One' }, { Supplier: '2', SupplierName: 'Two', PurchasingIsBlocked: true }],
        [
          { BusinessPartner: '1', Country: 'DE' },
          { BusinessPartner: '1', Country: 'AT' },
          { BusinessPartner: '2', Country: null }
        ]
      );
      expect(result).toEqual([
        { supplierNumber: '1', name: 'One', country_code: 'DE', isBlocked: false },
        { supplierNumber: '2', name: 'Two', country_code: null, isBlocked: true }
      ]);
    });
  });

  describe('toRemoteSuppliers, incomplete data', () => {
    it('falls back to the supplier number as name and skips rows without one', () => {
      const result = toRemoteSuppliers(
        [{ Supplier: '7', SupplierName: null }, { Supplier: '', SupplierName: 'nameless' }],
        []
      );
      expect(result).toEqual([{ supplierNumber: '7', name: '7', country_code: null, isBlocked: false }]);
    });
  });

  describe('planSupplierSync', () => {
    const countries = new Set(['DE', 'SE']);
    const local = [
      { ID: 'a', supplierNumber: '1', name: 'One', country_code: 'DE', isBlocked: false },
      { ID: 'b', supplierNumber: '2', name: 'Two', country_code: 'DE', isBlocked: false }
    ];

    it('creates what is new, updates only the fields S/4HANA changed, and counts the rest as unchanged', () => {
      const plan = planSupplierSync(
        [
          { supplierNumber: '1', name: 'One', country_code: 'DE', isBlocked: false },
          { supplierNumber: '2', name: 'Two GmbH', country_code: 'DE', isBlocked: true },
          { supplierNumber: '3', name: 'Three', country_code: 'SE', isBlocked: false }
        ],
        local,
        countries
      );
      expect(plan.unchanged).toEqual(['a']);
      expect(plan.update).toEqual([{ ID: 'b', changes: { name: 'Two GmbH', isBlocked: true } }]);
      expect(plan.create).toEqual([{ supplierNumber: '3', name: 'Three', country_code: 'SE', isBlocked: false }]);
    });

    it('does not take over a country the risk model does not know', () => {
      const plan = planSupplierSync(
        [
          { supplierNumber: '1', name: 'One', country_code: 'BR', isBlocked: false },
          { supplierNumber: '9', name: 'Nine', country_code: 'BR', isBlocked: false }
        ],
        local,
        countries
      );
      expect(plan.unchanged).toEqual(['a']);
      expect(plan.create[0]?.country_code).toBeNull();
    });

    it('takes over a country that was not maintained locally', () => {
      const plan = planSupplierSync(
        [{ supplierNumber: '1', name: 'One', country_code: 'SE', isBlocked: false }],
        [{ ID: 'a', supplierNumber: '1', name: 'One', country_code: null, isBlocked: null }],
        countries
      );
      expect(plan.update).toEqual([{ ID: 'a', changes: { country_code: 'SE' } }]);
    });

    it('leaves local suppliers alone that S/4HANA did not return', () => {
      const plan = planSupplierSync([], local, countries);
      expect(plan).toEqual({ create: [], update: [], unchanged: [] });
    });
  });

  describe('purchaseOrdersFor', () => {
    const item = (ID: string, supplier: string, extra: Record<string, unknown> = {}) => ({
      ID,
      description: `Item ${ID}`,
      quantity: '2.000',
      unit: 'EA',
      unitPrice: '10.50',
      currency_code: 'EUR',
      material: { materialNumber: `M-${ID}` },
      plant: { plantCode: '1010' },
      supplier: { supplierNumber: supplier },
      ...extra
    });

    it('creates one purchase order per supplier and keeps the item order', () => {
      const orders = purchaseOrdersFor(
        { requisitionNumber: 'PR-1', requester: 'rita', currency: 'EUR' },
        [item('a', 'S1'), item('b', 'S2'), item('c', 'S1')],
        '2026-09-17'
      );
      expect(orders.map((order) => [order.payload.Supplier, order.itemIds])).toEqual([
        ['S1', ['a', 'c']],
        ['S2', ['b']]
      ]);
      expect(orders[0]?.payload).toMatchObject({
        CompanyCode: '1010',
        PurchaseOrderType: 'NB',
        DocumentCurrency: 'EUR',
        PurchaseOrderDate: '2026-09-17'
      });
      expect(orders[0]?.payload.to_PurchaseOrderItem.map((line) => line.PurchaseOrderItem)).toEqual(['00010', '00020']);
      expect(orders[0]?.payload.to_PurchaseOrderItem[0]).toMatchObject({
        Material: 'M-a',
        OrderQuantity: 2,
        NetPriceAmount: 10.5,
        RequisitionerName: 'rita'
      });
    });

    it('cuts texts to what S/4HANA accepts and skips items without a supplier', () => {
      const orders = purchaseOrdersFor(
        { requester: 'a-very-long-user-name' },
        [item('a', 'S1', { description: 'x'.repeat(60) }), item('b', '', { supplier: null })],
        '2026-09-17'
      );
      expect(orders).toHaveLength(1);
      const line = orders[0]?.payload.to_PurchaseOrderItem[0];
      expect(String(line?.PurchaseOrderItemText)).toHaveLength(40);
      expect(String(line?.RequisitionerName)).toHaveLength(12);
    });

    it('falls back through item currency, requisition currency and EUR', () => {
      const bare = {
        ID: 'a',
        supplier: { supplierNumber: 'S1' },
        material: null,
        plant: null,
        quantity: null,
        unitPrice: null,
        unit: null,
        currency_code: null,
        description: null
      };
      const withRequisitionCurrency = purchaseOrdersFor({ currency: 'CHF' }, [bare], '2026-09-17');
      expect(withRequisitionCurrency[0]?.payload.DocumentCurrency).toBe('CHF');

      const orders = purchaseOrdersFor({}, [bare], '2026-09-17');
      expect(orders[0]?.payload.DocumentCurrency).toBe('EUR');
      expect(orders[0]?.payload.to_PurchaseOrderItem[0]).toEqual({
        PurchaseOrderItem: '00010',
        PurchaseOrderItemText: '',
        Material: null,
        Plant: null,
        OrderQuantity: 0,
        PurchaseOrderQuantityUnit: null,
        NetPriceAmount: 0,
        DocumentCurrency: 'EUR',
        RequisitionerName: ''
      });
    });

    it('returns nothing when no item has a supplier', () => {
      expect(purchaseOrdersFor({}, [], '2026-09-17')).toEqual([]);
    });
  });

  it('numbers items the S/4HANA way', () => {
    expect([0, 1, 9].map(itemNumber)).toEqual(['00010', '00020', '00100']);
  });
});
