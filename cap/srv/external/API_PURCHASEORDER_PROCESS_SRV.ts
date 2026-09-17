import cds from '@sap/cds';

/**
 * Mock behaviour of the S/4HANA purchase order API for local runs and tests.
 *
 * Only used when the service is mocked: against a real system S/4HANA assigns
 * the number itself from the number range of the purchase order type. The mock
 * imitates that (45xxxxxxxx, internal numbering), so the caller never sends a
 * number and works unchanged against both.
 */
export default class PurchaseOrderMock extends cds.ApplicationService {
  override async init(): Promise<void> {
    const { A_PurchaseOrder } = this.entities as Record<string, any>;

    this.before('CREATE', A_PurchaseOrder, async (req) => {
      const data = req.data as { PurchaseOrder?: string; to_PurchaseOrderItem?: Array<Record<string, unknown>> };
      if (data.PurchaseOrder) return;
      const last: { PurchaseOrder?: string } | undefined = await SELECT.one
        .from(A_PurchaseOrder)
        .columns('PurchaseOrder')
        .orderBy('PurchaseOrder desc');
      const next = Math.max(Number(last?.PurchaseOrder ?? 0) + 1, 4500000900);
      data.PurchaseOrder = String(next);
      for (const item of data.to_PurchaseOrderItem ?? []) item.PurchaseOrder = data.PurchaseOrder;
    });

    await super.init();
  }
}
