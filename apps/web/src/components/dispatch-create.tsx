'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createConsignment,
  createCustomer,
  createShopBranch,
  getCustomers,
  type ApiError,
  type CustomerOption,
  type ShopBranchOption,
} from '../lib/api';

const NEW_SHOP = '__new_shop__';

export function DispatchCreate({ onDone, onCancel }: { onDone: (cn: string) => void; onCancel: () => void }) {
  const [shops, setShops] = useState<CustomerOption[]>([]);
  const [shopId, setShopId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCustomers()
      .then(setShops)
      .catch((error: ApiError) => setMessage(error.message));
  }, []);

  const selectedShop = useMemo(() => shops.find((shop) => shop.id === shopId), [shops, shopId]);
  const shopBranches = selectedShop?.addresses ?? [];
  const addingShop = shopId === NEW_SHOP;
  const addingBranch = addingShop || Boolean(selectedShop && shopBranches.length === 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      let shop: CustomerOption | undefined = selectedShop;
      if (addingShop) shop = await createCustomer({ name: String(form.get('shopName') ?? '').trim() });
      if (!shop) throw new Error('Select a shop or add a new shop.');

      let pickupBranch: ShopBranchOption | undefined = shopBranches[0];
      if (addingBranch) {
        pickupBranch = await createShopBranch(shop.id, {
          label: String(form.get('shopBranchName') ?? '').trim(),
          addressLine: String(form.get('shopBranchAddress') ?? '').trim(),
          city: String(form.get('shopBranchCity') ?? '').trim() || undefined,
        });
      }
      if (!pickupBranch) throw new Error('Select a shop branch or add a new branch.');

      const result = await createConsignment({
        serviceType: String(form.get('serviceType')),
        customerId: shop.id,
        parties: [
          { kind: 'SENDER', name: shop.name },
          { kind: 'RECEIVER', name: String(form.get('receiverName')), phone: String(form.get('receiverPhone') || '') || undefined },
        ],
        addresses: [
          { kind: 'ORIGIN', addressLine: pickupBranch.addressLine, city: pickupBranch.city || undefined },
          { kind: 'DESTINATION', addressLine: String(form.get('deliveryAddress')), city: String(form.get('deliveryCity') || '') || undefined, landmark: String(form.get('landmark') || '') || undefined, deliveryNote: String(form.get('deliveryNote') || '') || undefined },
        ],
        packages: [{ packageNumber: 1, physicalWeight: Number(form.get('weight')), lengthCm: Number(form.get('length') || 0), widthCm: Number(form.get('width') || 0), heightCm: Number(form.get('height') || 0) }],
        items: [{ description: String(form.get('contents')), quantity: Number(form.get('quantity') || 1), unit: 'PARCEL' }],
        codAmount: String(form.get('codAmount') || '') ? Number(form.get('codAmount')) : undefined,
      });
      onDone(result.cnNumber);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Shipment could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content">
    <div className="page-header"><div><span className="eyebrow">SHIPMENTS / NEW</span><h2>Create shipment</h2><p>Select the sender shop and its pickup branch. Physical pickup happens later.</p></div></div>
    <form className="surface-panel booking-form" onSubmit={submit}>
      <div className="section-heading"><span>01</span><h3>Sender shop</h3></div>
      <div className="form-grid">
        <label className="field"><span>Shop</span><select value={shopId} onChange={(event) => setShopId(event.target.value)} required><option value="">Select shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}<option value={NEW_SHOP}>＋ Add new shop</option></select></label>
        {addingShop && <label className="field"><span>New shop name</span><input name="shopName" required /></label>}
        {!addingShop && shopBranches[0] && <div className="shop-pickup-preview"><span>Pickup automatically selected</span><strong>{shopBranches[0].label || selectedShop?.name}</strong><small>{shopBranches[0].addressLine}{shopBranches[0].city ? `, ${shopBranches[0].city}` : ''}</small></div>}
        {addingBranch && <><label className="field"><span>Branch name</span><input name="shopBranchName" placeholder="Main shop, Gulberg, Warehouse…" required /></label><label className="field wide"><span>Pickup address</span><input name="shopBranchAddress" required /></label><label className="field"><span>Pickup city</span><input name="shopBranchCity" /></label></>}
      </div>

      <div className="section-heading"><span>02</span><h3>Receiver and delivery</h3></div>
      <div className="form-grid"><label className="field"><span>Receiver name</span><input name="receiverName" required /></label><label className="field"><span>Receiver phone</span><input name="receiverPhone" placeholder="+923001234567" /></label><label className="field wide"><span>Delivery address</span><input name="deliveryAddress" required /></label><label className="field"><span>Delivery city</span><input name="deliveryCity" /></label><label className="field"><span>Landmark</span><input name="landmark" /></label><label className="field wide"><span>Delivery notes</span><input name="deliveryNote" /></label></div>

      <div className="section-heading"><span>03</span><h3>Parcel and courier handling</h3></div>
      <div className="form-grid"><label className="field wide"><span>Contents description</span><input name="contents" required /></label><label className="field"><span>Parcel quantity</span><input min="1" name="quantity" type="number" defaultValue="1" required /></label><label className="field"><span>Weight (kg)</span><input min="0.01" name="weight" step="0.01" type="number" required /></label><label className="field"><span>Length (cm)</span><input min="0" name="length" type="number" defaultValue="0" /></label><label className="field"><span>Width (cm)</span><input min="0" name="width" type="number" defaultValue="0" /></label><label className="field"><span>Height (cm)</span><input min="0" name="height" type="number" defaultValue="0" /></label><label className="field"><span>Service</span><select name="serviceType"><option value="SAME_DAY">Same day</option><option value="STANDARD">Standard</option><option value="EXPRESS">Express</option></select></label><label className="field"><span>COD amount (optional)</span><input min="0" name="codAmount" step="0.01" type="number" /></label></div>
      {message && <div className="error-callout">{message}</div>}
      <div className="form-actions"><button className="button subtle" onClick={onCancel} type="button">Cancel</button><button className="button primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create shipment and CN'}</button></div>
    </form>
  </div>;
}
