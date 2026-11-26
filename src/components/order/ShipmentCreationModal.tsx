import React, { useEffect, useState } from 'react';
import { FaTruck, FaRupeeSign, FaSpinner, FaPlane, FaBox, FaMoneyBillWave, FaClock, FaSync, FaGlobe, FaExclamationTriangle } from 'react-icons/fa';
import Modal from './Modal';
import api, { shippingAPI, packagesAPI, walletAPI } from '../../services/api';

interface Warehouse {
  _id: string;
  name: string;
  code: string;
  isActive: boolean;
  shippingProviders?: {
    shiprocket?: {
      enabled: boolean;
    };
    delhivery?: {
      enabled: boolean;
      warehouseCode?: string;
    };
  };
}

interface ShippingProvider {
  id: string;
  name: string;
}

/** A provider whose courier offers the window lists for a person to choose from. */
type RateProvider = 'shiprocket' | 'growcord_ship';

interface CourierRate {
  /** Shiprocket's numeric courier id, or Growcord Ship's offer id (the exact courier and buy it was quoted). */
  courierCompanyId: number | string;
  courierName: string;
  rate: number;
  estimatedDeliveryDays: number;
  estimatedDeliveryDate?: string;
  codAvailable: boolean;
  airAvailable: boolean;
  surfaceAvailable: boolean;
  qty: number;
  /** The price's parts when the rate states them: shipping (freight), the courier's COD charge, GST. */
  freightCharge?: number;
  codCharge?: number;
  gstCharge?: number;
  /** What the courier charges if the parcel returns to origin (RTO), when its answer states it. */
  rtoCharge?: number;
}

/** A positive rupee amount from a rate field, else undefined. */
const rupeeOf = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * "Shipping Rs a + COD Rs b + GST Rs c = Rs total" from what the rate states. Growcord Ship states all three;
 * Shiprocket states freight and COD, and anything else in its total is shown as "other charges or tax".
 */
const breakupOf = (c: CourierRate): string | null => {
  if (c.freightCharge === undefined) return null;
  const r = (n: number) => `₹${n.toFixed(2)}`;
  const parts = [`Shipping ${r(c.freightCharge)}`];
  if (c.codCharge) parts.push(`COD ${r(c.codCharge)}`);
  if (c.gstCharge !== undefined) {
    parts.push(`GST ${r(c.gstCharge)}`);
  } else {
    const other = Math.round((c.rate - c.freightCharge - (c.codCharge ?? 0)) * 100) / 100;
    if (other > 0) parts.push(`other charges or tax ${r(other)}`);
  }
  return `${parts.join(' + ')} = ${r(c.rate)}`;
};

interface DelhiveryServiceType {
  type: 'express' | 'surface';
  rate: number;
  estimatedDeliveryDays: number;
  codAvailable: boolean;
}

interface OrderItem {
  // Items arrive either pre-mapped (productName/size) or as raw order_items
  // rows (product_name/sku/attributes) — read both shapes.
  productName?: string;
  product_name?: string;
  /** Resolved pack label/SKU (backend CATALOG_LABEL_SQL) — DISPLAY only. */
  catalog_name?: string;
  catalogName?: string;
  catalog_sku?: string;
  catalogSku?: string;
  name?: string;
  sku?: string;
  size?: string;
  attributes?: Record<string, string>;
  quantity: number;
  price: number;
  /** Per-unit weight (kg) — joined from the variation/product by the API. */
  weight_kg?: number;
  weightKg?: number;
  _id?: string;
  productId?: string;
}

/** Boxes store length/breadth/height (+ optional `weight` = the box's own dead
 *  weight in kg); tolerate the legacy lengthCm/widthCm/heightCm spellings. */
const boxDims = (box: any) => ({
  length: box?.length ?? box?.lengthCm ?? '',
  breadth: box?.breadth ?? box?.widthCm ?? '',
  height: box?.height ?? box?.heightCm ?? '',
  deadWeightKg: Number(box?.weight ?? box?.deadWeightKg ?? 0) || 0,
});

const itemUnitWeightKg = (item?: OrderItem): number =>
  Number(item?.weight_kg ?? item?.weightKg ?? 0.5) || 0.5;

/** Who books the parcel. `growcord_ship` = Growcord Ship, the one aggregator: it picks the courier itself. */
export type ShipProviderId = 'shiprocket' | 'delhivery' | 'manual' | 'growcord_ship';

interface ShipmentCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data?: {
    selectedCourierId?: number | string | null;
    /** Growcord Ship: a waybill its courier already issued for this order, taken over instead of a new booking. */
    existingAwb?: string;
    selectedDelhiveryType?: 'express' | 'surface' | null;
    weight?: number;
    length?: number;
    breadth?: number;
    height?: number;
    selectedItemIndices?: number[];
    /** PART-QUANTITY selections: exactly which units this parcel carries. */
    itemSelections?: Array<{ sku: string; quantity: number }>;
    packageBoxId?: string;
    /** Manual parcels: what was paid to the carrier, rupees (asked every time; 0 only when typed as 0). */
    manualShippingCharge?: number;
  }) => void;
  loading: boolean;
  selectedShippingProvider: ShipProviderId;
  /**
   * Typed with the three original providers so a caller whose state is that narrower union (Order Detail)
   * still fits; the modal hands `growcord_ship` through `chooseProvider` below, a plain string at run time.
   */
  onShippingProviderChange: (provider: 'shiprocket' | 'delhivery' | 'manual') => void;
  selectedWarehouseId: string;
  onWarehouseChange: (warehouseId: string) => void;
  warehouses: Warehouse[];
  shippingProviders: ShippingProvider[];
  manualTrackingId: string;
  manualCarrierName: string;
  manualTrackingUrl: string;
  onManualTrackingIdChange: (value: string) => void;
  onManualCarrierNameChange: (value: string) => void;
  onManualTrackingUrlChange: (value: string) => void;
  orderId: string;
  orderItems: OrderItem[];
  /**
   * Units still unshipped per line (key = SKU, or product name for SKU-less
   * lines) — from the order's fulfillment. When provided, the modal defaults
   * and CAPS each line at the REMAINING quantity and skips fully-shipped lines,
   * so a reship after a part shipment can't double-ship.
   */
  remainingByKey?: Record<string, number>;
}

/**
 * One provider's courier offers as a list to choose from (Shiprocket and Growcord Ship, owner 22 Nov 2026:
 * "all couriers rate show ... while booking parcel for orders just like shiprocket"). Cheapest first.
 */
const CourierRateList: React.FC<{
  rates: CourierRate[];
  loading: boolean;
  selected: number | string | null;
  onSelect: (id: number | string) => void;
  onFetch: () => void;
  fetchLabel: string;
  canFetch: boolean;
  error?: string | null;
  emptyText?: string;
}> = ({ rates, loading, selected, onSelect, onFetch, fetchLabel, canFetch, error, emptyText }) => (
  <div className="pl-7 space-y-3">
    {rates.length === 0 && !loading && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFetch();
        }}
        disabled={!canFetch}
        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02]"
      >
        <FaSync size={14} />
        {fetchLabel}
      </button>
    )}
    {loading ? (
      <div className="flex items-center gap-2 text-gray-500">
        <FaSpinner className="animate-spin" size={16} />
        <span>Loading courier rates...</span>
      </div>
    ) : rates.length > 0 ? (
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {rates.map((courier, idx) => (
          <div
            key={courier.courierCompanyId ?? `courier-${idx}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(courier.courierCompanyId);
            }}
            className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
              selected === courier.courierCompanyId
                ? 'border-blue-600 bg-blue-50 shadow-md'
                : 'border-gray-200 hover:border-gray-400 hover:shadow-sm bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="radio"
                  checked={selected === courier.courierCompanyId}
                  onChange={() => onSelect(courier.courierCompanyId)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium text-gray-900">{courier.courierName}</h5>
                    {courier.rate > 0 && (
                      <div className="flex items-center gap-1 text-green-600 font-semibold">
                        <FaRupeeSign size={12} />
                        <span>{courier.rate.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    {courier.estimatedDeliveryDays > 0 && (
                      <div className="flex items-center gap-1">
                        <FaClock size={10} />
                        <span>{courier.estimatedDeliveryDays} days</span>
                      </div>
                    )}
                    {courier.codAvailable && (
                      <div className="flex items-center gap-1 text-green-600">
                        <FaMoneyBillWave size={10} />
                        <span>COD</span>
                      </div>
                    )}
                    {courier.rtoCharge !== undefined && (
                      <span
                        className="text-amber-700"
                        title="What this courier charges if the parcel comes back to you (return to origin)"
                      >
                        RTO ₹{courier.rtoCharge.toFixed(2)}
                        {rates.filter((r) => r.rtoCharge !== undefined).length > 1 &&
                          courier.rtoCharge === Math.max(...rates.map((r) => r.rtoCharge ?? 0)) &&
                          ' (highest)'}
                      </span>
                    )}
                    {(courier.airAvailable || courier.surfaceAvailable) && (
                      <span>
                        {courier.airAvailable && courier.surfaceAvailable
                          ? 'Air + Surface'
                          : courier.airAvailable
                          ? 'Air'
                          : 'Surface'}
                      </span>
                    )}
                  </div>
                  {breakupOf(courier) && (
                    <p className="mt-1 text-xs text-gray-500 tabular-nums">{breakupOf(courier)}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : error ? (
      <p className="text-sm text-red-600">{error}</p>
    ) : (
      emptyText !== '' && <p className="text-sm text-red-600">{emptyText ?? 'No courier rates available'}</p>
    )}
  </div>
);

const ShipmentCreationModal: React.FC<ShipmentCreationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  selectedShippingProvider,
  onShippingProviderChange,
  selectedWarehouseId,
  onWarehouseChange,
  warehouses: rawWarehouses,
  shippingProviders,
  manualTrackingId,
  manualCarrierName,
  manualTrackingUrl,
  onManualTrackingIdChange,
  onManualCarrierNameChange,
  onManualTrackingUrlChange,
  orderId,
  orderItems = [],
  remainingByKey,
}) => {
  const [courierRates, setCourierRates] = useState<CourierRate[]>([]);
  const [delhiveryRates, setDelhiveryRates] = useState<DelhiveryServiceType[]>([]);
  const [selectedDelhiveryType, setSelectedDelhiveryType] = useState<'express' | 'surface' | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [loadingDelhiveryRate, setLoadingDelhiveryRate] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState<number | string | null>(null);
  /** Owner 26 Nov 2026 ("can't i sync by awb no"): a waybill the courier already issued on Growcord Ship's account. */
  const [existingAwb, setExistingAwb] = useState('');
  // What the store paid its own carrier for a manual parcel (owner, 23 Nov 2026: "in manual always ask shipping
  // charges"). Kept here and handed over with the submit, so both callers send it without new props.
  const [manualCharge, setManualCharge] = useState('');
  // Growcord Ship's own courier offers (owner 22 Nov 2026: every courier's rate while booking, as Shiprocket shows).
  const [gsRates, setGsRates] = useState<CourierRate[]>([]);
  const [loadingGsRates, setLoadingGsRates] = useState(false);
  const [gsRatesError, setGsRatesError] = useState<string | null>(null);
  // Whose Shiprocket account priced the Shiprocket rates: the store's own ('store') or Growcord's ('platform').
  const [srAccountSource, setSrAccountSource] = useState<string | null>(null);
  const [hasShiprocket, setHasShiprocket] = useState(false);
  const [hasDelhivery, setHasDelhivery] = useState(false);
  // v2 lists warehouses without their own carrier switches (ship WarehouseView; the facility list keeps
  // them detail-only). A warehouse with none switched on ships with the store's carriers that have an
  // account (GET /ship/providers); the booking then takes the account's pickup location or the warehouse name.
  const warehouses: Warehouse[] = (Array.isArray(rawWarehouses) ? rawWarehouses : []).map((w) => {
    const own = w?.shippingProviders;
    if (!w || own?.shiprocket?.enabled || own?.delhivery?.enabled) return w;
    return { ...w, shippingProviders: { ...own, shiprocket: { ...own?.shiprocket, enabled: hasShiprocket }, delhivery: { ...own?.delhivery, enabled: hasDelhivery } } };
  });
  
  // Package details state
  const [weight, setWeight] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [breadth, setBreadth] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [packageBoxes, setPackageBoxes] = useState<any[]>([]);
  const [selectedPackageBoxId, setSelectedPackageBoxId] = useState<string>('');
  
  // Selected items for this shipment
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([]);
  // PART-QUANTITY: how many units of each selected line go in THIS parcel
  // (defaults to the line's full quantity).
  const [selectedQtys, setSelectedQtys] = useState<Record<number, number>>({});
  // One-shot guard: auto-pick the default box only once per modal open, so a
  // deliberate "-- Custom Dimensions --" choice isn't overridden.
  const autoBoxAppliedRef = React.useRef(false);

  /** Line identity — must mirror the backend's lineKey (SKU, else product name). */
  const lineKeyOf = (item?: OrderItem): string =>
    String(item?.sku || item?.productName || item?.product_name || item?.name || '').trim();

  /** Max units THIS parcel may carry: the unshipped remainder when known, else the ordered qty. */
  const lineMax = (idx: number): number => {
    const ordered = Number(orderItems[idx]?.quantity) || 1;
    if (!remainingByKey) return ordered;
    const rem = remainingByKey[lineKeyOf(orderItems[idx])];
    return rem === undefined ? ordered : Math.max(0, Math.min(ordered, rem));
  };

  const qtyFor = (idx: number, qtys: Record<number, number> = selectedQtys): number => {
    const max = lineMax(idx);
    const q = Math.floor(Number(qtys[idx]));
    return Number.isFinite(q) && q >= 1 ? Math.min(q, max) : max;
  };

  /** Auto weight = Σ selected units' weight + the box's dead weight. */
  const computeAutoWeight = (indices: number[], boxId: string, qtys: Record<number, number> = selectedQtys): string => {
    const productsKg = indices.reduce((s, idx) => {
      const it = orderItems[idx];
      return s + itemUnitWeightKg(it) * qtyFor(idx, qtys);
    }, 0);
    const box = packageBoxes.find(b => (b._id ?? b.id) === boxId);
    const total = productsKg + (box ? boxDims(box).deadWeightKg : 0);
    return total > 0 ? total.toFixed(2) : '';
  };

  const setLineQty = (idx: number, next: number) => {
    const max = lineMax(idx);
    const q = Math.min(Math.max(1, Math.floor(next) || 1), Math.max(1, max));
    setSelectedQtys(prev => {
      const merged = { ...prev, [idx]: q };
      setWeight(computeAutoWeight(selectedItemIndices, selectedPackageBoxId, merged));
      return merged;
    });
  };

  useEffect(() => {
    if (shippingProviders) {
      setHasShiprocket(shippingProviders.some(p => p.id === 'shiprocket'));
      setHasDelhivery(shippingProviders.some(p => p.id === 'delhivery'));
    }
  }, [shippingProviders]);
  // Growcord Ship is offered whenever the store has it switched on (GET /shipping/providers lists it); it needs
  // no per-warehouse courier mapping because Growcord Ship allocates the courier for each parcel.
  const hasGrowcordShip = Array.isArray(shippingProviders) && shippingProviders.some(p => p.id === 'growcord_ship');
  /** The store's Growcord wallet, which Growcord Ship freight comes off: asked only while Growcord Ship is the chosen
   *  provider in an open window, so the balance and Add money sit beside its couriers (owner 26 Nov 2026: "add option
   *  to add money"). Add money opens the Wallet page's Razorpay recharge in a new tab, so this window keeps its parcel. */
  /** `undefined` while asking; `null` when the balance cannot be read (no billing.read): the link stays. */
  const [gsWallet, setGsWallet] = useState<{ balance: number } | null | undefined>(undefined);
  const loadGsWallet = () => {
    walletAPI.get()
      .then((w: any) => setGsWallet(w && w.balance != null && Number.isFinite(Number(w.balance)) ? { balance: Number(w.balance) } : null))
      .catch(() => setGsWallet(null));
  };
  useEffect(() => {
    if (!isOpen || selectedShippingProvider !== 'growcord_ship') return;
    loadGsWallet();
    // Back from the Wallet tab: read the balance again.
    const onFocus = () => { if (document.visibilityState === 'visible') loadGsWallet(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedShippingProvider]);
  const chooseProvider = onShippingProviderChange as (provider: ShipProviderId) => void;

  useEffect(() => {
    if (isOpen) {
      packagesAPI.getAll().then(res => {
        let boxesData: any[] = [];
        if (res?.success && Array.isArray(res?.data)) boxesData = res.data;
        else if (Array.isArray(res)) boxesData = res;
        else if (Array.isArray(res?.data)) boxesData = res.data;
        else if (Array.isArray(res?.data?.data)) boxesData = res.data.data;
        setPackageBoxes(boxesData);
      }).catch(err => console.error('Failed to load package boxes', err));
    }
  }, [isOpen]);

  // Reset rates when warehouse/order changes - but DON'T fetch automatically
  useEffect(() => {
    if (!selectedWarehouseId || !orderId) {
      setCourierRates([]);
      setGsRates([]);
      setDelhiveryRates([]);
      setSelectedCourierId(null);
      setSelectedDelhiveryType(null);
    }
  }, [selectedWarehouseId, orderId]);

  /** One provider's courier offers for this order, cheapest first; the cheapest is preselected. */
  const loadRates = async (provider: RateProvider) => {
    if (!selectedWarehouseId || !orderId) return;
    const setRates = provider === 'growcord_ship' ? setGsRates : setCourierRates;
    const setLoading = provider === 'growcord_ship' ? setLoadingGsRates : setLoadingRates;
    if (provider === 'growcord_ship') setGsRatesError(null);
    
    // Backend calculates weight from order items automatically
    // Weight and dimensions are optional - backend uses defaults if not provided

    setLoading(true);
    try {
      // Ensure warehouseId is a string (not an object)
      const warehouseIdStr = selectedWarehouseId && typeof selectedWarehouseId === 'object' 
        ? (selectedWarehouseId as any)?._id || String(selectedWarehouseId)
        : String(selectedWarehouseId || '');
      
      const response = await shippingAPI.getCourierRates(
        orderId,
        warehouseIdStr || undefined,
        {
          weight: parseFloat(weight) || undefined,
          length: parseFloat(length) || undefined,
          breadth: parseFloat(breadth) || undefined,
          height: parseFloat(height) || undefined,
        },
        provider
      );

      // API interceptor may return array directly (normalized) or { success, data }
      if (provider === 'shiprocket') {
        const source = (response as any)?.account_source ?? (response as any)?.data?.account_source;
        setSrAccountSource(typeof source === 'string' ? source : null);
      }
      const ratesArray: any[] = Array.isArray(response)
        ? response
        : (response?.data && Array.isArray(response.data))
          ? response.data
          : [];

      if (ratesArray.length > 0) {
        const sortedRates = [...ratesArray]
          .filter((c: any) => c && (c.rate > 0 || c.total_price > 0) && (c.courierName || c.courier_name || c.name))
          .map((c: any) => ({
            courierCompanyId: c.courier_company_id ?? c.courierCompanyId ?? c.id,
            courierName: c.courier_name ?? c.courierName ?? c.name ?? 'Unknown Courier',
            rate: parseFloat(c.rate ?? c.total_price ?? 0),
            estimatedDeliveryDays: c.estimated_delivery_days ?? c.estimatedDeliveryDays ?? c.delivery_days ?? 0,
            estimatedDeliveryDate: c.estimated_delivery_date ?? c.estimatedDeliveryDate,
            // Growcord Ship states a COD fee and its service type instead of Shiprocket's flags.
            codAvailable: c.cod === 1 || c.cod === true || c.cod === 'Y' || Number(c.cod_charge) > 0,
            airAvailable: c.air === 1 || c.air === true || c.air === 'Y' || c.service_type === 'express' || c.service_type === 'air',
            surfaceAvailable: c.surface === 1 || c.surface === true || c.surface === 'Y' || c.service_type === 'surface',
            qty: c.qty || 1,
            freightCharge: rupeeOf(c.freight_charge ?? c.freightCharge),
            codCharge: rupeeOf(c.cod_charge ?? c.cod_charges ?? c.codCharge),
            gstCharge: c.gst_charge !== undefined && c.gst_charge !== null ? Number(c.gst_charge) : undefined,
            rtoCharge: rupeeOf(c.rto_charge ?? c.rto_charges ?? c.rtoCharge),
          }))
          .sort((a, b) => a.rate - b.rate);
        setRates(sortedRates);
        if (sortedRates.length > 0 && selectedShippingProvider === provider) {
          setSelectedCourierId(sortedRates[0].courierCompanyId);
        }
      } else {
        setRates([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch courier rates:', error.response?.data || error.message);
      setRates([]);
      if (provider === 'growcord_ship') {
        setGsRatesError(error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || 'Growcord Ship did not answer');
      }
    } finally {
      setLoading(false);
    }
  };
  // Rates are priced on the parcel's weight and box, so both must be filled first.
  const dimsReady = [weight, length, breadth, height].every((v) => !!v && parseFloat(v) > 0);
  const fetchCourierRates = () => loadRates('shiprocket');
  const fetchGrowcordShipRates = () => loadRates('growcord_ship');

  // A provider change keeps only that provider's courier: its cheapest offer when its rates are loaded.
  useEffect(() => {
    const list = selectedShippingProvider === 'growcord_ship' ? gsRates : selectedShippingProvider === 'shiprocket' ? courierRates : [];
    setSelectedCourierId(list.length > 0 ? list[0].courierCompanyId : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShippingProvider]);

  const fetchDelhiveryRates = async () => {
    if (!orderId) return;
    
    // Backend calculates weight from order items automatically
    // Weight is optional - backend uses defaults if not provided
    // Backend can use order's warehouse if no warehouseId is provided

    setLoadingDelhiveryRate(true);
    try {
      // Ensure warehouseId is a string (not an object) or undefined
      let warehouseIdStr: string | undefined = undefined;
      if (selectedWarehouseId) {
        warehouseIdStr = typeof selectedWarehouseId === 'object' 
          ? (selectedWarehouseId as any)?._id || String(selectedWarehouseId)
          : String(selectedWarehouseId);
        // Only use if it's a valid non-empty string
        if (!warehouseIdStr || warehouseIdStr === 'undefined' || warehouseIdStr === '[object Object]' || warehouseIdStr.trim() === '') {
          warehouseIdStr = undefined;
        }
      }
      
      // Fetch DELHIVERY rates for both Express and Surface
      // Backend automatically uses warehouse pincode from warehouseId for rate calculation
      const dims = {
        weight: parseFloat(weight) || undefined,
        length: parseFloat(length) || undefined,
        breadth: parseFloat(breadth) || undefined,
        height: parseFloat(height) || undefined,
      };
      const [expressResult, surfaceResult] = await Promise.allSettled([
        shippingAPI.getDelhiveryRates(orderId, warehouseIdStr, 'express', dims),
        shippingAPI.getDelhiveryRates(orderId, warehouseIdStr, 'surface', dims),
      ]);

      console.log('DELHIVERY rates response:', { expressResult, surfaceResult });
      
      const rates: DelhiveryServiceType[] = [];
      
      // Helper: extract rates array (API may return array directly or { success, data })
      const getRatesArray = (resp: any): any[] => {
        if (Array.isArray(resp)) return resp;
        if (resp?.data && Array.isArray(resp.data)) return resp.data;
        return [];
      };

      // Process Express rates
      if (expressResult.status === 'fulfilled') {
        const expressResponse = expressResult.value;
        const expressData = getRatesArray(expressResponse);
        const expressRate = expressData.find((r: any) => r.serviceType === 'express') || expressData[0];

        if (expressRate && (expressRate.rate > 0 || expressRate.charges > 0)) {
          rates.push({
            type: 'express',
            rate: expressRate.rate ?? expressRate.charges ?? 0,
            estimatedDeliveryDays: expressRate.estimatedDeliveryDays ?? expressRate.estimated_delivery_days ?? 0,
            codAvailable: expressRate.codAvailable ?? false,
          });
        }
      }

      // Process Surface rates
      if (surfaceResult.status === 'fulfilled') {
        const surfaceResponse = surfaceResult.value;
        const surfaceData = getRatesArray(surfaceResponse);
        const surfaceRate = surfaceData.find((r: any) => r.serviceType === 'surface') || surfaceData[0];

        if (surfaceRate && (surfaceRate.rate > 0 || surfaceRate.charges > 0)) {
          rates.push({
            type: 'surface',
            rate: surfaceRate.rate ?? surfaceRate.charges ?? 0,
            estimatedDeliveryDays: surfaceRate.estimatedDeliveryDays ?? surfaceRate.estimated_delivery_days ?? 0,
            codAvailable: surfaceRate.codAvailable ?? false,
          });
        }
      }

      console.log('📦 Final DELHIVERY rates array:', rates);
      console.log('📦 Rates count:', rates.length);
      
      if (rates.length > 0) {
        console.log('✅ Setting DELHIVERY rates:', rates);
        setDelhiveryRates(rates);
        // Auto-select first option if delhivery is selected
        if (selectedShippingProvider === 'delhivery' && !selectedDelhiveryType) {
          setSelectedDelhiveryType(rates[0].type);
        }
      } else {
        console.warn('⚠️ No DELHIVERY rates available for this route');
        console.warn('⚠️ Express result:', expressResult);
        console.warn('⚠️ Surface result:', surfaceResult);
        setDelhiveryRates([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch DELHIVERY rates:', error);
      console.error('Error details:', error.response?.data || error.message);
      setDelhiveryRates([]);
    } finally {
      setLoadingDelhiveryRate(false);
    }
  };

  // Fetch rates for all enabled shipping providers
  const fetchAllRates = async () => {
    if (!selectedWarehouseId || !orderId) {
      alert('Please select a warehouse first');
      return;
    }

    // Validate weight and dimensions before fetching rates
    if (!weight || parseFloat(weight) <= 0) {
      alert('Please enter package weight before fetching rates');
      return;
    }
    if (!length || !breadth || !height || parseFloat(length) <= 0 || parseFloat(breadth) <= 0 || parseFloat(height) <= 0) {
      alert('Please enter package dimensions (length, breadth, height) before fetching rates');
      return;
    }

    // Find selected warehouse
    const selectedWarehouse = Array.isArray(warehouses) 
      ? warehouses.find(w => w && w._id === selectedWarehouseId)
      : null;
    
    if (!selectedWarehouse) {
      alert('Selected warehouse not found');
      return;
    }

    // Fetch rates for all enabled providers
    const promises: Promise<any>[] = [];

    // Growcord Ship's couriers: no per-warehouse mapping, the store's switch is enough.
    if (hasGrowcordShip) {
      promises.push(fetchGrowcordShipRates());
    }

    // Fetch Shiprocket rates if enabled
    if (hasShiprocket && selectedWarehouse.shippingProviders?.shiprocket?.enabled) {
      promises.push(
        fetchCourierRates().catch(err => {
          console.error('Error fetching Shiprocket rates:', err);
          return null;
        })
      );
    }

    // Fetch DELHIVERY rates if enabled
    if (hasDelhivery && selectedWarehouse.shippingProviders?.delhivery?.enabled) {
      promises.push(
        fetchDelhiveryRates().catch(err => {
          console.error('Error fetching DELHIVERY rates:', err);
          return null;
        })
      );
    }

    // Wait for all rate fetches to complete
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    } else {
      alert('No shipping providers are enabled for this warehouse');
    }
  };

  // On open: select every item and pre-fill the weight from the items' real
  // (variation/product) weights. Dimension defaults hold until a box applies.
  useEffect(() => {
    if (isOpen && orderItems.length > 0) {
      autoBoxAppliedRef.current = false;
      // Pre-select only lines with units still to ship (all, on a fresh order).
      const selectable = orderItems.map((_, index) => index).filter((idx) => lineMax(idx) > 0);
      setSelectedItemIndices(selectable);
      setSelectedQtys({});
      setWeight(computeAutoWeight(selectable, '', {}));
      if (!length) setLength('20');
      if (!breadth) setBreadth('15');
      if (!height) setHeight('10');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orderItems]);

  // Boxes load async — once they arrive, auto-apply the default (or only/first)
  // box so dimensions AND dead weight fill without a click. One-shot per open.
  useEffect(() => {
    if (!isOpen || autoBoxAppliedRef.current || !packageBoxes.length || selectedPackageBoxId) return;
    const box = packageBoxes.find((b: any) => b.isDefault ?? b.is_default) ?? packageBoxes[0];
    if (!box) return;
    autoBoxAppliedRef.current = true;
    const boxId = String(box._id ?? box.id ?? '');
    setSelectedPackageBoxId(boxId);
    const d = boxDims(box);
    if (d.length) setLength(String(d.length));
    if (d.breadth) setBreadth(String(d.breadth));
    if (d.height) setHeight(String(d.height));
    setWeight(computeAutoWeight(
      selectedItemIndices.length ? selectedItemIndices : orderItems.map((_, i) => i),
      boxId,
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, packageBoxes, selectedPackageBoxId, orderItems]);

  const handleClose = () => {
    setExistingAwb('');
    onManualTrackingIdChange('');
    onManualCarrierNameChange('');
    onManualTrackingUrlChange('');
    setManualCharge('');
    setCourierRates([]);
    setGsRates([]);
    setGsRatesError(null);
    setDelhiveryRates([]);
    setSelectedCourierId(null);
    setSelectedDelhiveryType(null);
    setWeight('');
    setLength('');
    setBreadth('');
    setHeight('');
    setSelectedItemIndices([]);
    setSelectedQtys({});
    setSelectedPackageBoxId('');
    onClose();
  };
  
  const toggleItemSelection = (index: number) => {
    setSelectedItemIndices(prev => {
      const newSelection = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      // Deselecting resets the line's qty back to "all".
      setSelectedQtys(q => {
        const next = { ...q };
        if (!newSelection.includes(index)) delete next[index];
        // Keep the auto weight in step with the selection (still editable).
        setWeight(computeAutoWeight(newSelection, selectedPackageBoxId, next));
        return next;
      });
      return newSelection;
    });
  };

  /** The exact units this parcel will carry — sent to the backend. */
  const buildItemSelections = (): Array<{ sku: string; quantity: number }> =>
    selectedItemIndices.map((idx) => {
      const it = orderItems[idx];
      return {
        sku: String(it?.sku || it?.productName || it?.product_name || it?.name || '').trim(),
        quantity: qtyFor(idx),
      };
    }).filter((s) => s.sku && s.quantity > 0);

  const isPartQuantity = selectedItemIndices.some((idx) => qtyFor(idx) < (Number(orderItems[idx]?.quantity) || 1));

  // Check if submission is disabled based on provider
  const getValidationError = (): string | null => {
    if (!selectedWarehouseId) return 'Please select a warehouse';
    if (selectedItemIndices.length === 0) return 'Please select at least one item for shipment';
    if (!weight || parseFloat(weight) <= 0) return 'Please enter package weight (kg)';
    if (!length || parseFloat(length) <= 0) return 'Please enter package length (cm)';
    if (!breadth || parseFloat(breadth) <= 0) return 'Please enter package breadth (cm)';
    if (!height || parseFloat(height) <= 0) return 'Please enter package height (cm)';
    if (selectedShippingProvider === 'manual') {
      if (!manualTrackingId.trim() || !manualCarrierName.trim()) {
        return 'Enter the tracking ID (AWB) and the carrier name';
      }
      if (!/^\d+(\.\d{1,2})?$/.test(manualCharge.trim())) {
        return 'Enter the shipping charge paid to the carrier in rupees (0 if it was free)';
      }
    }
    if (selectedShippingProvider === 'shiprocket') {
      if (loadingRates) return 'Loading courier rates...';
      if (!selectedCourierId || courierRates.length === 0) {
        return 'Please select a courier partner';
      }
    }
    // Growcord Ship books the chosen offer; with none chosen it allocates the courier itself.
    if (selectedShippingProvider === 'growcord_ship' && loadingGsRates) return 'Loading courier rates...';
    if (selectedShippingProvider === 'delhivery') {
      if (loadingDelhiveryRate) return 'Loading DELHIVERY rates...';
      if (!selectedDelhiveryType || delhiveryRates.length === 0) {
        return 'Please select Express or Surface service';
      }
    }
    return null;
  };

  // ══ CUSTOMS (international orders only) ═══════════════════════════
  //
  // The modal resolves the ship-to country ITSELF from the order rather than
  // taking a prop, because both call sites (OrderDetail, Shipments) build the
  // create-shipment body from their own state and neither is edited by this
  // change. For the same reason the panel SAVES the declaration to the order's
  // customs DRAFT (`PUT /shipments/order/:id/customs`) instead of returning it
  // through onSubmit — the backend binds that draft to the shipment it books.
  // A form whose values nothing persists is worse than no form at all
  // (COMMON_MISTAKES #248).
  const [customsLoaded, setCustomsLoaded] = useState(false);
  const [isIntl, setIsIntl] = useState(false);
  const [destCountry, setDestCountry] = useState<string>('');
  const [customsSaving, setCustomsSaving] = useState(false);
  const [customsSaved, setCustomsSaved] = useState(false);
  const [customsError, setCustomsError] = useState<string | null>(null);
  const [csbType, setCsbType] = useState<'IV' | 'V'>('V');
  const [incoterm, setIncoterm] = useState<'DAP' | 'DDP'>('DAP');
  const [declaredCurrency, setDeclaredCurrency] = useState('USD');
  const [declaredValue, setDeclaredValue] = useState('');
  const [exportReason, setExportReason] = useState('SALE');
  const [exportIdentity, setExportIdentity] = useState<{ iec: string; adCode: string; lutNumber: string }>({ iec: '', adCode: '', lutNumber: '' });
  const [hsByLine, setHsByLine] = useState<Record<number, string>>({});
  const [dgByLine, setDgByLine] = useState<Record<number, boolean>>({});

  /** HS-6 = the first 6 digits of the line's own HSN (the ONE derivation rule). */
  const hs6 = (hsn?: string | null): string => {
    const digits = String(hsn ?? '').replace(/[^0-9]/g, '');
    return digits.length >= 6 ? digits.slice(0, 6) : '';
  };
  /** Potency Q = mother tincture = an ethanol solution = dangerous goods. */
  const lineIsDg = (item?: OrderItem): boolean => {
    const attrs = (item?.attributes ?? {}) as Record<string, any>;
    for (const [k, v] of Object.entries(attrs)) {
      const key = String(k).toLowerCase();
      const val = String(v ?? '').trim().toLowerCase();
      if (!val) continue;
      if (key.includes('potency') && (val === 'q' || val === '\u00f8')) return true;
      if ((key.includes('form') || key.includes('type')) && val.replace(/[^a-z]/g, '') === 'mothertincture') return true;
    }
    return false;
  };

  useEffect(() => {
    if (!isOpen || !orderId) return;
    let cancelled = false;
    (async () => {
      try {
        // The order tells us the destination; the settings tell us the export
        // identity (4.5 gstConfig.export) — IEC/AD/LUT are NEVER typed here,
        // they are shown read-only so the operator can see what will be filed.
        const [orderRes, draftRes, settingsRes] = await Promise.all([
          api.get(`/orders/${orderId}`).catch(() => null),
          api.get(`/shipments/order/${orderId}/customs`).catch(() => null),
          api.get('/settings/admin').catch(() => api.get('/settings').catch(() => null)),
        ]);
        if (cancelled) return;
        const order = (orderRes?.data?.data ?? orderRes?.data) as any;
        const draftPayload = (draftRes?.data?.data ?? draftRes?.data) as any;
        // The SERVER decides whether this order is international — the same
        // `isInternationalOrder` the booking itself runs. Re-deriving that rule
        // in the browser would be a second definition of it (#35/#200 class);
        // the local parse below is only the fallback for when the route is
        // unreachable (an older backend, a network blip).
        const addr = order?.shippingAddress ?? order?.shipping_address ?? {};
        const raw = String(draftPayload?.destinationCountry ?? addr.country ?? addr.countryCode ?? '').trim();
        const cc = !raw ? 'IN' : /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : /^india$/i.test(raw) ? 'IN' : raw.toUpperCase().slice(0, 2);
        setDestCountry(cc);
        setIsIntl(draftPayload?.isInternational != null ? !!draftPayload.isInternational : cc !== 'IN');

        const settings = (settingsRes?.data?.data ?? settingsRes?.data) as any;
        const exp = settings?.gstConfig?.export ?? {};
        setExportIdentity({ iec: exp.iec ?? '', adCode: exp.adCode ?? '', lutNumber: exp.lutNumber ?? '' });

        const draft = draftPayload?.draft;
        if (draft) {
          if (draft.csb_type === 'IV' || draft.csb_type === 'V') setCsbType(draft.csb_type);
          if (draft.incoterm === 'DDP') setIncoterm('DDP');
          if (draft.declared_currency) setDeclaredCurrency(String(draft.declared_currency));
          if (draft.declared_value_minor != null) setDeclaredValue((Number(draft.declared_value_minor) / 100).toFixed(2));
          if (draft.export_reason) setExportReason(String(draft.export_reason));
        } else {
          // Default the declaration to what the shopper actually paid.
          const cur = String(order?.currency ?? 'INR').toUpperCase();
          setDeclaredCurrency(cur);
          const minor = order?.presentmentTotalMinor ?? order?.presentment_total_minor;
          setDeclaredValue(minor != null ? (Number(minor) / 100).toFixed(2) : Number(order?.total ?? 0).toFixed(2));
        }
      } catch {
        // A customs panel that cannot load must never block a domestic booking.
      } finally {
        if (!cancelled) setCustomsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, orderId]);

  // HS + DG default from the catalogue every time the line selection changes.
  useEffect(() => {
    if (!isIntl) return;
    setHsByLine((prev) => {
      const next = { ...prev };
      orderItems.forEach((it, idx) => {
        if (next[idx] === undefined) next[idx] = hs6((it as any).catalog_hsn ?? (it as any).hsn_code ?? (it as any).hsnCode);
      });
      return next;
    });
    setDgByLine((prev) => {
      const next = { ...prev };
      orderItems.forEach((it, idx) => { if (next[idx] === undefined) next[idx] = lineIsDg(it); });
      return next;
    });
  }, [isIntl, orderItems]);

  const selectedDg = selectedItemIndices.some((i) => dgByLine[i]);
  const missingHs = selectedItemIndices.filter((i) => !hsByLine[i]);

  const saveCustoms = async () => {
    setCustomsSaving(true); setCustomsError(null); setCustomsSaved(false);
    try {
      await api.put(`/shipments/order/${orderId}/customs`, {
        csbType, incoterm, exportReason,
        declaredCurrency: declaredCurrency.toUpperCase(),
        declaredValueMinor: Math.round((parseFloat(declaredValue) || 0) * 100),
        containsDg: selectedDg,
      });
      setCustomsSaved(true);
    } catch (e: any) {
      setCustomsError(e?.response?.data?.message ?? e?.message ?? 'Could not save the customs declaration');
    } finally {
      setCustomsSaving(false);
    }
  };

  const validationError = getValidationError();
  const isSubmitDisabled = loading || !!validationError;

  const footer = (
    <>
      <button
        type="button"
        onClick={handleClose}
        className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-all font-semibold text-sm"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          if (validationError) {
            alert(validationError);
            return;
          }
          onSubmit({
            selectedCourierId: selectedShippingProvider === 'shiprocket' || selectedShippingProvider === 'growcord_ship' ? selectedCourierId : undefined,
            existingAwb: selectedShippingProvider === 'growcord_ship' && existingAwb.trim() ? existingAwb.trim() : undefined,
            selectedDelhiveryType: selectedShippingProvider === 'delhivery' ? selectedDelhiveryType || null : undefined,
            weight: parseFloat(weight),
            length: parseFloat(length),
            breadth: parseFloat(breadth),
            height: parseFloat(height),
            selectedItemIndices: selectedItemIndices.length > 0 ? selectedItemIndices : undefined,
            itemSelections: selectedItemIndices.length > 0 ? buildItemSelections() : undefined,
            packageBoxId: selectedPackageBoxId || undefined,
            manualShippingCharge: selectedShippingProvider === 'manual' ? Number(manualCharge.trim()) : undefined,
          });
        }}
        disabled={isSubmitDisabled}
        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-sm shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
        title={validationError || undefined}
      >
        <FaTruck size={14} />
        {loading ? 'Creating...' : 'Create Shipment'}
      </button>
    </>
  );


  // Helper function to extract string ID from ObjectId or string
  const extractIdString = (id: any): string => {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id !== null) {
      // Handle ObjectId object - try to extract the string value
      if (id.toString && typeof id.toString === 'function') {
        return id.toString();
      } else if (id.buffer) {
        // Handle buffer-based ObjectId
        const buffer = id.buffer;
        if (buffer && typeof buffer === 'object') {
          // Convert buffer to hex string
          const hex = Array.from(new Uint8Array(Object.values(buffer) as number[]))
            .map((b: number) => b.toString(16).padStart(2, '0'))
            .join('');
          return hex;
        }
      }
    }
    return String(id);
  };

  const selectedWarehouse = warehouses.find(w => {
    const warehouseId = extractIdString(w._id);
    const selectedId = extractIdString(selectedWarehouseId);
    const match = warehouseId === selectedId;
    if (!match && selectedWarehouseId) {
      console.warn('🔍 Warehouse ID mismatch:', {
        warehouseId,
        selectedId,
        warehouseName: w.name,
        warehouseIdType: typeof w._id,
        selectedIdType: typeof selectedWarehouseId,
        allWarehouseIds: warehouses.map(wh => ({ id: extractIdString(wh._id), name: wh.name })),
      });
    }
    return match;
  });
  // The providers "Get Courier Rates & Partners" asks, in the order fetchAllRates asks them.
  const rateSources: string[] = [
    ...(hasGrowcordShip ? ['Growcord Ship'] : []),
    ...(hasShiprocket && selectedWarehouse?.shippingProviders?.shiprocket?.enabled ? ['Shiprocket'] : []),
    ...(hasDelhivery && selectedWarehouse?.shippingProviders?.delhivery?.enabled ? ['Delhivery'] : []),
  ];

  if (selectedWarehouseId && !selectedWarehouse) {
    console.error('❌ Selected warehouse not found!', {
      selectedWarehouseId,
      selectedWarehouseIdType: typeof selectedWarehouseId,
      availableWarehouses: warehouses.map(w => ({ 
        id: extractIdString(w._id), 
        idRaw: w._id,
        idType: typeof w._id,
        name: w.name 
      })),
      warehousesCount: warehouses.length,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Shipment" footer={footer} maxWidth="6xl">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar - Warehouse Selection */}
        <div className="lg:col-span-4">
          <div className="sticky top-0 space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FaBox className="text-blue-600" size={18} />
                Warehouse Selection
              </h3>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Warehouse *
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => {
                  onWarehouseChange(e.target.value);
                  onShippingProviderChange('manual');
                }}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium bg-white hover:border-gray-400 transition-colors"
              >
              <option value="">-- Select Warehouse --</option>
              {Array.isArray(warehouses) && warehouses
                .filter(w => w.isActive !== false)
                .map((warehouse) => {
                  const isShiprocketEnabled = warehouse.shippingProviders?.shiprocket?.enabled || false;
                  const isDelhiveryEnabled = warehouse.shippingProviders?.delhivery?.enabled || false;
                  
                  return (
                    <option key={warehouse._id} value={warehouse._id}>
                      {warehouse.name} ({warehouse.code})
                      {isDelhiveryEnabled && warehouse.shippingProviders?.delhivery?.warehouseCode &&
                        ` - DELHIVERY: ${warehouse.shippingProviders.delhivery.warehouseCode}`
                      }
                      {!isShiprocketEnabled && !isDelhiveryEnabled && !hasGrowcordShip && ` ⚠️ (No provider enabled)`}
                    </option>
                  );
                })}
            </select>
            
              {selectedWarehouse && (
                <div className="mt-5 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-base text-gray-900 mb-3 flex items-center gap-2">
                    {selectedWarehouse.name}
                    <span className="text-xs font-normal text-gray-500">({selectedWarehouse.code})</span>
                  </h4>
                  <div className="text-sm text-gray-700 space-y-2">
                    {selectedWarehouse.shippingProviders?.delhivery?.warehouseCode && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">DELHIVERY Code:</span>
                        <span className="px-2 py-1 bg-white rounded border border-gray-300 text-xs font-mono">{selectedWarehouse.shippingProviders.delhivery.warehouseCode}</span>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="font-semibold mb-2 text-sm">Enabled Providers:</p>
                      <div className="flex flex-wrap gap-2">
                        {hasGrowcordShip && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            ✓ Growcord Ship
                          </span>
                        )}
                        {selectedWarehouse.shippingProviders?.shiprocket?.enabled && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            ✓ Shiprocket
                          </span>
                        )}
                        {selectedWarehouse.shippingProviders?.delhivery?.enabled && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            ✓ DELHIVERY
                          </span>
                        )}
                        {!hasGrowcordShip &&
                         !selectedWarehouse.shippingProviders?.shiprocket?.enabled &&
                         !selectedWarehouse.shippingProviders?.delhivery?.enabled && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                            ⚠️ No providers enabled
                          </span>
                        )}
                      </div>
                      {hasGrowcordShip && (
                        <p className="mt-2 text-xs text-gray-600">
                          Growcord Ship sets this warehouse up on each of its couriers by itself, so nothing to map here.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content - Shipping Options */}
        <div className="lg:col-span-8">
          {!selectedWarehouseId ? (
            <div className="text-center py-12 text-gray-500">
              <FaTruck className="mx-auto mb-4 text-gray-400" size={48} />
              <p>Please select a warehouse to view shipping options</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Order Items Selection */}
              {orderItems.length > 0 && (
                <div className="border-2 border-gray-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <label className="block text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FaBox className="text-blue-600" size={16} />
                    Select Items for This Shipment *
                  </label>
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-2">
                    {orderItems.map((item, index) => {
                      const max = lineMax(index);
                      const shippedOut = max === 0;
                      const ordered = Number(item.quantity) || 1;
                      return (
                      <div
                        key={index}
                        onClick={() => { if (!shippedOut) toggleItemSelection(index); }}
                        className={`flex items-center gap-3 p-4 border-2 rounded-xl transition-all ${
                          shippedOut
                            ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                            : selectedItemIndices.includes(index)
                              ? 'border-blue-600 bg-blue-50 shadow-md cursor-pointer'
                              : 'border-gray-200 hover:border-gray-400 hover:shadow-sm cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIndices.includes(index)}
                          disabled={shippedOut}
                          onChange={() => toggleItemSelection(index)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm text-gray-900">
                            {/* DISPLAY uses the resolved pack (catalog_*), same as
                                Order Items, the invoice and the packing slip. The
                                line KEY above deliberately does NOT — it must keep
                                mirroring the backend's snapshot-based lineKey. */}
                            {item.catalog_name || item.catalogName || item.productName || item.product_name || item.name || 'Item'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {[
                              (item.catalog_sku || item.catalogSku || item.sku)
                                ? `SKU: ${item.catalog_sku || item.catalogSku || item.sku}` : null,
                              item.size || (item.attributes && Object.values(item.attributes).filter(Boolean).join(' · ')) || null,
                              remainingByKey && max < ordered
                                ? `Remaining: ${max} of ${ordered}`
                                : `Ordered: ${ordered}`,
                              `₹${(item.price * item.quantity).toLocaleString('en-IN')}`,
                            ].filter(Boolean).join(' | ')}
                          </p>
                        </div>
                        {shippedOut && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700 shrink-0">
                            FULLY SHIPPED
                          </span>
                        )}
                        {/* PART-QUANTITY: how many units of this line ship in THIS parcel */}
                        {!shippedOut && selectedItemIndices.includes(index) && max > 1 && (
                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setLineQty(index, qtyFor(index) - 1)}
                              disabled={qtyFor(index) <= 1}
                              className="w-7 h-7 rounded-md border border-gray-300 text-gray-700 font-bold disabled:opacity-40 hover:bg-gray-100"
                            >−</button>
                            <span className={`text-sm font-semibold w-14 text-center ${qtyFor(index) < max ? 'text-blue-700' : 'text-gray-900'}`}>
                              {qtyFor(index)} / {max}
                            </span>
                            <button
                              type="button"
                              onClick={() => setLineQty(index, qtyFor(index) + 1)}
                              disabled={qtyFor(index) >= max}
                              className="w-7 h-7 rounded-md border border-gray-300 text-gray-700 font-bold disabled:opacity-40 hover:bg-gray-100"
                            >+</button>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Selected: {selectedItemIndices.length} of {orderItems.length} items
                    {(isPartQuantity || (selectedItemIndices.length > 0 && selectedItemIndices.length < orderItems.length)) && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                        PART SHIPMENT — remaining units stay open for another parcel
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Package Details */}
              <div className="border-2 border-gray-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
                <label className="block text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaBox className="text-blue-600" size={16} />
                  Package Details *
                </label>
                
                {packageBoxes.length > 0 && (
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Package Box (Optional)
                    </label>
                    <select
                      value={selectedPackageBoxId}
                      onChange={(e) => {
                        const boxId = e.target.value;
                        setSelectedPackageBoxId(boxId);
                        if (boxId) {
                          const box = packageBoxes.find(b => (b._id ?? b.id) === boxId);
                          if (box) {
                            const d = boxDims(box);
                            setLength(String(d.length || ''));
                            setBreadth(String(d.breadth || ''));
                            setHeight(String(d.height || ''));
                          }
                        }
                        // Re-derive weight with the new box's dead weight (or none).
                        setWeight(computeAutoWeight(selectedItemIndices, boxId));
                      }}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium bg-white hover:border-gray-400 transition-colors"
                    >
                      <option value="">-- Custom Dimensions --</option>
                      {packageBoxes.map(box => {
                        const d = boxDims(box);
                        return (
                          <option key={box._id ?? box.id} value={box._id ?? box.id}>
                            {box.name} ({d.length}x{d.breadth}x{d.height} cm{d.deadWeightKg ? `, box ${d.deadWeightKg} kg` : ''})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Weight (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="0.5"
                      className="w-full px-4 py-3 text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-400 transition-colors"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Auto-calculated from the selected items' product weights + the box's dead weight — adjust if the actual parcel differs.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Length (cm) *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      placeholder="20"
                      className="w-full px-4 py-3 text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Breadth (cm) *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={breadth}
                      onChange={(e) => setBreadth(e.target.value)}
                      placeholder="15"
                      className="w-full px-4 py-3 text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Height (cm) *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="10"
                      className="w-full px-4 py-3 text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-400 transition-colors"
                    />
                  </div>
                </div>
                <div className="mt-5 pt-5 border-t-2 border-gray-200">
                  <button
                    type="button"
                    onClick={fetchAllRates}
                    disabled={
                      !weight || parseFloat(weight) <= 0 || 
                      !length || !breadth || !height || 
                      parseFloat(length) <= 0 || parseFloat(breadth) <= 0 || parseFloat(height) <= 0 ||
                      loadingRates || loadingDelhiveryRate || loadingGsRates
                    }
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02]"
                    title={
                      !weight || parseFloat(weight) <= 0 || 
                      !length || !breadth || !height || 
                      parseFloat(length) <= 0 || parseFloat(breadth) <= 0 || parseFloat(height) <= 0
                        ? 'Please enter weight and all dimensions'
                        : 'Get courier rates and partners'
                    }
                  >
                    {(loadingRates || loadingDelhiveryRate || loadingGsRates) ? (
                      <>
                        <FaSpinner className="animate-spin" size={16} />
                        <span>Fetching Rates...</span>
                      </>
                    ) : (
                      <>
                        <FaSync size={16} />
                        <span>Get Courier Rates & Partners</span>
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    {rateSources.length > 0
                      ? `Asks ${rateSources.length > 1 ? `${rateSources.slice(0, -1).join(', ')} and ${rateSources[rateSources.length - 1]}` : rateSources[0]} for this parcel's rates`
                      : 'No shipping provider is switched on for this warehouse'}
                  </p>
                </div>
              </div>

              {/* ══ CUSTOMS — only for a destination outside India ═════════ */}
              {customsLoaded && isIntl && (
                <div className="mb-6 border-2 border-amber-300 bg-amber-50 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <FaGlobe className="text-amber-700" size={16} />
                    <h4 className="text-base font-semibold text-gray-900">
                      Customs declaration — export to {destCountry}
                    </h4>
                  </div>
                  <p className="text-xs text-gray-600 mb-4">
                    Saved against this order. It is attached to the shipment when you book, and it is
                    what the commercial invoice, the packing list and GSTR-1 Table 6A read.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Declaration</label>
                      <select
                        value={csbType}
                        onChange={(e) => { setCsbType(e.target.value as 'IV' | 'V'); setCustomsSaved(false); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="V">CSB-V — commercial</option>
                        <option value="IV">CSB-IV — gift / sample</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Incoterm</label>
                      <select
                        value={incoterm}
                        onChange={(e) => { setIncoterm(e.target.value as 'DAP' | 'DDP'); setCustomsSaved(false); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="DAP">DAP — buyer pays duty</option>
                        <option value="DDP">DDP — we pay duty</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Declared currency</label>
                      <input
                        type="text" maxLength={3} value={declaredCurrency}
                        onChange={(e) => { setDeclaredCurrency(e.target.value.toUpperCase()); setCustomsSaved(false); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Declared value</label>
                      <input
                        type="number" step="0.01" min="0" value={declaredValue}
                        onChange={(e) => { setDeclaredValue(e.target.value); setCustomsSaved(false); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Reason for export</label>
                    <input
                      type="text" value={exportReason}
                      onChange={(e) => { setExportReason(e.target.value); setCustomsSaved(false); }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="SALE"
                    />
                  </div>

                  {/* HS per line — prefilled from the product's own HSN (first 6). */}
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-700 mb-2">HS codes on this parcel</div>
                    <div className="space-y-2">
                      {orderItems.map((item, idx) => (
                        selectedItemIndices.includes(idx) ? (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="flex-1 text-xs text-gray-800 truncate">
                              {(item as any).catalog_name ?? item.productName ?? item.product_name ?? item.name}
                              {dgByLine[idx] && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-semibold">DG</span>
                              )}
                            </span>
                            <input
                              type="text" value={hsByLine[idx] ?? ''} maxLength={8}
                              onChange={(e) => setHsByLine((p) => ({ ...p, [idx]: e.target.value.replace(/[^0-9]/g, '') }))}
                              placeholder="HS-6"
                              className={`w-28 px-2 py-1 border rounded text-xs ${hsByLine[idx] ? 'border-gray-300' : 'border-red-300 bg-red-50'}`}
                            />
                          </div>
                        ) : null
                      ))}
                    </div>
                    {missingHs.length > 0 && (
                      <p className="text-[11px] text-red-700 mt-2">
                        {missingHs.length} line(s) have no HS code. Set the HSN on the product so it fills in
                        automatically — a line with no HS code is what gets a parcel held at customs.
                      </p>
                    )}
                  </div>

                  {selectedDg && (
                    <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <FaExclamationTriangle className="text-red-600 mt-0.5" size={14} />
                      <p className="text-xs text-red-800">
                        This parcel contains a <strong>mother tincture</strong> — an ethanol solution
                        (UN1170, Class 3 flammable liquid). It may travel only by <strong>surface</strong>
                        {' '}under the limited-quantity exemption; an air lane will be refused at booking.
                      </p>
                    </div>
                  )}

                  <div className="text-[11px] text-gray-600 mb-4">
                    <div>IEC: <strong>{exportIdentity.iec || '— not set'}</strong></div>
                    <div>AD code: <strong>{exportIdentity.adCode || '— not set'}</strong></div>
                    <div>LUT: <strong>{exportIdentity.lutNumber || '— not set'}</strong></div>
                    <div className="mt-1 text-gray-500">
                      From Settings ▸ GST engine &amp; exports (4.5). CSB-V needs both IEC and AD code.
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button" onClick={saveCustoms} disabled={customsSaving}
                      className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {customsSaving ? 'Saving…' : 'Save customs declaration'}
                    </button>
                    {customsSaved && <span className="text-xs text-green-700 font-semibold">Saved</span>}
                    {customsError && <span className="text-xs text-red-700">{customsError}</span>}
                  </div>
                </div>
              )}

              <label className="block text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FaTruck className="text-blue-600" size={16} />
                Select Shipping Method *
              </label>

              {/* Growcord Ship: the one aggregator, so it leads the list when the store has it on. */}
              {hasGrowcordShip && (
                <div
                  onClick={() => chooseProvider('growcord_ship')}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                    selectedShippingProvider === 'growcord_ship'
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-400 hover:shadow-sm bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={selectedShippingProvider === 'growcord_ship'}
                      onChange={() => chooseProvider('growcord_ship')}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">Growcord Ship</h4>
                      <p className="text-sm text-gray-500">
                        Every courier in Growcord Ship with its price for this parcel. Choose one, or leave it and Growcord Ship picks. Freight comes off your wallet.
                      </p>
                      {selectedShippingProvider === 'growcord_ship' && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          {gsWallet !== null && (
                            <span className="text-gray-700">
                              Wallet balance:{' '}
                              <span className="font-semibold text-gray-900">
                                {gsWallet ? `₹${gsWallet.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'checking'}
                              </span>
                            </span>
                          )}
                          <a
                            href="/settings/wallet"
                            target="_blank"
                            rel="noopener"
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            Add money
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                  {selectedShippingProvider === 'growcord_ship' && (
                    <div className="mt-3">
                      <CourierRateList
                        rates={gsRates}
                        loading={loadingGsRates}
                        selected={selectedCourierId}
                        onSelect={setSelectedCourierId}
                        onFetch={fetchGrowcordShipRates}
                        fetchLabel="Get courier rates"
                        canFetch={dimsReady}
                        error={gsRatesError}
                        emptyText=""
                      />
                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        <label className="block text-sm font-medium text-gray-700">
                          Waybill already issued by this courier (optional)
                        </label>
                        <input
                          type="text"
                          value={existingAwb}
                          onChange={(e) => setExistingAwb(e.target.value)}
                          placeholder="AWB number"
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Only when the courier already issued a waybill for this order on Growcord Ship's account. Choose that
                          courier above and enter its waybill: Growcord Ship checks it with the courier and takes it over instead
                          of booking a new one, at the price shown.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Option */}
              <div
                onClick={() => onShippingProviderChange('manual')}
                className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                  selectedShippingProvider === 'manual'
                    ? 'border-blue-600 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-400 hover:shadow-sm bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={selectedShippingProvider === 'manual'}
                    onChange={() => onShippingProviderChange('manual')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">Manual Shipping</h4>
                    <p className="text-sm text-gray-500">Enter AWB/Tracking ID manually</p>
                  </div>
                </div>
                {selectedShippingProvider === 'manual' && (
                  <div className="mt-4 space-y-3 pl-7">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Tracking ID (AWB) *
                      </label>
                      <input
                        type="text"
                        value={manualTrackingId}
                        onChange={(e) => onManualTrackingIdChange(e.target.value)}
                        placeholder="Enter tracking ID/AWB"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Carrier Name *
                      </label>
                      <input
                        type="text"
                        value={manualCarrierName}
                        onChange={(e) => onManualCarrierNameChange(e.target.value)}
                        placeholder="e.g., Blue Dart, FedEx"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Shipping charge paid to the carrier (Rs) *
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualCharge}
                        onChange={(e) => setManualCharge(e.target.value)}
                        placeholder="e.g. 85 (type 0 if it was free)"
                        aria-required="true"
                        className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          manualCharge.trim() === '' || /^\d+(\.\d{1,2})?$/.test(manualCharge.trim()) ? 'border-gray-300' : 'border-red-400'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        The full amount you paid for this parcel, GST included. It shows on the shipment and in COD payouts, and can be corrected later with a reason.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Tracking URL (optional)
                      </label>
                      <input
                        type="url"
                        value={manualTrackingUrl}
                        onChange={(e) => onManualTrackingUrlChange(e.target.value)}
                        placeholder="https://www.carrier.com/track/TRACKING_ID"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* DELHIVERY Option with Express/Surface */}
              {hasDelhivery && selectedWarehouse?.shippingProviders?.delhivery?.enabled && (
                <div
                  onClick={() => onShippingProviderChange('delhivery')}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                    selectedShippingProvider === 'delhivery'
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-400 hover:shadow-sm bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        checked={selectedShippingProvider === 'delhivery'}
                        onChange={() => onShippingProviderChange('delhivery')}
                        className="h-4 w-4 text-blue-600"
                      />
                      <div>
                        <h4 className="font-semibold text-gray-900">DELHIVERY</h4>
                        <p className="text-sm text-gray-500">Integrated delivery partner</p>
                      </div>
                    </div>
                  </div>

                  {selectedShippingProvider === 'delhivery' && (
                    <div className="pl-7 space-y-3">
                      {delhiveryRates.length === 0 && !loadingDelhiveryRate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchDelhiveryRates();
                          }}
                          disabled={!weight || parseFloat(weight) <= 0}
                          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02]"
                        >
                          <FaSync size={14} />
                          Get DELHIVERY Rates
                        </button>
                      )}
                      {loadingDelhiveryRate ? (
                        <div className="flex items-center gap-2 text-gray-500">
                          <FaSpinner className="animate-spin" size={16} />
                          <span>Loading rates...</span>
                        </div>
                      ) : delhiveryRates.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {delhiveryRates.map((rate) => (
                            <div
                              key={rate.type}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDelhiveryType(rate.type);
                              }}
                              className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                                selectedDelhiveryType === rate.type
                                  ? 'border-blue-600 bg-blue-50 shadow-md'
                                  : 'border-gray-200 hover:border-gray-400 hover:shadow-sm bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    checked={selectedDelhiveryType === rate.type}
                                    onChange={() => setSelectedDelhiveryType(rate.type)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 text-blue-600"
                                  />
                                  <h5 className="font-semibold text-gray-900 capitalize flex items-center gap-1">
                                    {rate.type === 'express' ? <FaPlane size={12} /> : <FaBox size={12} />}
                                    {rate.type}
                                  </h5>
                                </div>
                                <div className="flex items-center gap-1 text-green-600 font-semibold">
                                  <FaRupeeSign size={10} />
                                  <span>{rate.rate.toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 space-y-1">
                                <div className="flex items-center gap-1">
                                  <FaClock size={10} />
                                  <span>Est. {rate.estimatedDeliveryDays} days</span>
                                </div>
                                {rate.codAvailable && (
                                  <div className="flex items-center gap-1 text-green-600">
                                    <FaMoneyBillWave size={10} />
                                    <span>COD Available</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-red-600">Not Serviceable</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Shiprocket Couriers */}
              {hasShiprocket && selectedWarehouse?.shippingProviders?.shiprocket?.enabled && (
                <div
                  onClick={() => onShippingProviderChange('shiprocket')}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                    selectedShippingProvider === 'shiprocket'
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-400 hover:shadow-sm bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        checked={selectedShippingProvider === 'shiprocket'}
                        onChange={() => onShippingProviderChange('shiprocket')}
                        className="h-4 w-4 text-blue-600"
                      />
                      <div>
                        <h4 className="font-semibold text-gray-900">Shiprocket</h4>
                        <p className="text-sm text-gray-500">
                          {srAccountSource === 'store'
                            ? "Your own Shiprocket account: Shiprocket's price, paid from your Shiprocket wallet."
                            : srAccountSource === 'platform'
                              ? "Growcord's Shiprocket account: freight comes off your Growcord wallet."
                              : 'Multiple delivery partners'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedShippingProvider === 'shiprocket' && (
                    <CourierRateList
                      rates={courierRates}
                      loading={loadingRates}
                      selected={selectedCourierId}
                      onSelect={setSelectedCourierId}
                      onFetch={fetchCourierRates}
                      fetchLabel="Get Shiprocket Rates"
                      canFetch={dimsReady}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ShipmentCreationModal;
