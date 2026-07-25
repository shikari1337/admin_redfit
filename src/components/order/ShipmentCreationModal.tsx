import React, { useEffect, useState } from 'react';
import { FaTruck, FaRupeeSign, FaSpinner, FaPlane, FaBox, FaMoneyBillWave, FaClock, FaSync } from 'react-icons/fa';
import Modal from './Modal';
import { shippingAPI, packagesAPI } from '../../services/api';

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

interface CourierRate {
  courierCompanyId: number;
  courierName: string;
  rate: number;
  estimatedDeliveryDays: number;
  estimatedDeliveryDate?: string;
  codAvailable: boolean;
  airAvailable: boolean;
  surfaceAvailable: boolean;
  qty: number;
}

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

interface ShipmentCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data?: {
    selectedCourierId?: number | null;
    selectedDelhiveryType?: 'express' | 'surface' | null;
    weight?: number;
    length?: number;
    breadth?: number;
    height?: number;
    selectedItemIndices?: number[];
    /** PART-QUANTITY selections: exactly which units this parcel carries. */
    itemSelections?: Array<{ sku: string; quantity: number }>;
    packageBoxId?: string;
  }) => void;
  loading: boolean;
  selectedShippingProvider: 'shiprocket' | 'delhivery' | 'manual';
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

const ShipmentCreationModal: React.FC<ShipmentCreationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  selectedShippingProvider,
  onShippingProviderChange,
  selectedWarehouseId,
  onWarehouseChange,
  warehouses,
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
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [hasShiprocket, setHasShiprocket] = useState(false);
  const [hasDelhivery, setHasDelhivery] = useState(false);
  
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
      setDelhiveryRates([]);
      setSelectedCourierId(null);
      setSelectedDelhiveryType(null);
    }
  }, [selectedWarehouseId, orderId]);

  const fetchCourierRates = async () => {
    if (!selectedWarehouseId || !orderId) return;
    
    // Backend calculates weight from order items automatically
    // Weight and dimensions are optional - backend uses defaults if not provided

    setLoadingRates(true);
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
        }
      );
      console.log('Shiprocket rates response:', response);

      // API interceptor may return array directly (normalized) or { success, data }
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
            codAvailable: c.cod === 1 || c.cod === true || c.cod === 'Y',
            airAvailable: c.air === 1 || c.air === true || c.air === 'Y',
            surfaceAvailable: c.surface === 1 || c.surface === true || c.surface === 'Y',
            qty: c.qty || 1,
          }))
          .sort((a, b) => a.rate - b.rate);
        setCourierRates(sortedRates);
        if (sortedRates.length > 0 && selectedShippingProvider === 'shiprocket') {
          setSelectedCourierId(sortedRates[0].courierCompanyId);
        }
      } else {
        console.warn('No courier rates in response:', response);
        setCourierRates([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch courier rates:', error);
      console.error('Error details:', error.response?.data || error.message);
      setCourierRates([]);
    } finally {
      setLoadingRates(false);
    }
  };

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
    onManualTrackingIdChange('');
    onManualCarrierNameChange('');
    onManualTrackingUrlChange('');
    setCourierRates([]);
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
      if (!manualTrackingId || !manualCarrierName || !manualTrackingUrl) {
        return 'Please enter all manual tracking details';
      }
    }
    if (selectedShippingProvider === 'shiprocket') {
      if (loadingRates) return 'Loading courier rates...';
      if (!selectedCourierId || courierRates.length === 0) {
        return 'Please select a courier partner';
      }
    }
    if (selectedShippingProvider === 'delhivery') {
      if (loadingDelhiveryRate) return 'Loading DELHIVERY rates...';
      if (!selectedDelhiveryType || delhiveryRates.length === 0) {
        return 'Please select Express or Surface service';
      }
    }
    return null;
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
            selectedCourierId: selectedShippingProvider === 'shiprocket' ? selectedCourierId : undefined,
            selectedDelhiveryType: selectedShippingProvider === 'delhivery' ? selectedDelhiveryType || null : undefined,
            weight: parseFloat(weight),
            length: parseFloat(length),
            breadth: parseFloat(breadth),
            height: parseFloat(height),
            selectedItemIndices: selectedItemIndices.length > 0 ? selectedItemIndices : undefined,
            itemSelections: selectedItemIndices.length > 0 ? buildItemSelections() : undefined,
            packageBoxId: selectedPackageBoxId || undefined,
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
                      {!isShiprocketEnabled && !isDelhiveryEnabled && ` ⚠️ (No provider enabled)`}
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
                        {!selectedWarehouse.shippingProviders?.shiprocket?.enabled && 
                         !selectedWarehouse.shippingProviders?.delhivery?.enabled && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                            ⚠️ No providers enabled
                          </span>
                        )}
                      </div>
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
                            {item.productName || item.product_name || item.name || 'Item'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {[
                              item.sku ? `SKU: ${item.sku}` : null,
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
                      loadingRates || loadingDelhiveryRate
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
                    {(loadingRates || loadingDelhiveryRate) ? (
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
                    This will fetch rates from all enabled shipping providers (Shiprocket & DELHIVERY)
                  </p>
                </div>
              </div>

              <label className="block text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FaTruck className="text-blue-600" size={16} />
                Select Shipping Method *
              </label>

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
                        Tracking URL *
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
                        <p className="text-sm text-gray-500">Multiple delivery partners</p>
                      </div>
                    </div>
                  </div>

                  {selectedShippingProvider === 'shiprocket' && (
                    <div className="pl-7 space-y-3">
                      {courierRates.length === 0 && !loadingRates && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchCourierRates();
                          }}
                          disabled={!weight || parseFloat(weight) <= 0 || !length || !breadth || !height || 
                                   parseFloat(length) <= 0 || parseFloat(breadth) <= 0 || parseFloat(height) <= 0}
                          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02]"
                        >
                          <FaSync size={14} />
                          Get Shiprocket Rates
                        </button>
                      )}
                      {loadingRates ? (
                        <div className="flex items-center gap-2 text-gray-500">
                          <FaSpinner className="animate-spin" size={16} />
                          <span>Loading courier rates...</span>
                        </div>
                      ) : courierRates.length > 0 ? (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {courierRates.map((courier, idx) => (
                            <div
                              key={courier.courierCompanyId ?? `courier-${idx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCourierId(courier.courierCompanyId);
                              }}
                              className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                                selectedCourierId === courier.courierCompanyId
                                  ? 'border-blue-600 bg-blue-50 shadow-md'
                                  : 'border-gray-200 hover:border-gray-400 hover:shadow-sm bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <input
                                    type="radio"
                                    checked={selectedCourierId === courier.courierCompanyId}
                                    onChange={() => setSelectedCourierId(courier.courierCompanyId)}
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
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-red-600">No courier rates available</p>
                      )}
                    </div>
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
