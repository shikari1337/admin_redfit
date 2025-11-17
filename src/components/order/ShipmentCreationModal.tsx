import React, { useEffect, useState } from 'react';
import { FaTruck, FaTimes, FaRupeeSign, FaSpinner, FaPlane, FaBox, FaMoneyBillWave, FaClock, FaSync } from 'react-icons/fa';
import Modal from './Modal';
import { shippingAPI } from '../../services/api';

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
  productName: string;
  size: string;
  quantity: number;
  price: number;
  _id?: string;
  productId?: string;
}

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
  
  // Selected items for this shipment
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([]);

  useEffect(() => {
    if (shippingProviders) {
      setHasShiprocket(shippingProviders.some(p => p.id === 'shiprocket'));
      setHasDelhivery(shippingProviders.some(p => p.id === 'delhivery'));
    }
  }, [shippingProviders]);

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
    
    // Validate weight and dimensions before fetching rates
    if (!weight || parseFloat(weight) <= 0) {
      alert('Please enter package weight before fetching rates');
      return;
    }
    if (!length || !breadth || !height || parseFloat(length) <= 0 || parseFloat(breadth) <= 0 || parseFloat(height) <= 0) {
      alert('Please enter package dimensions (length, breadth, height) before fetching rates');
      return;
    }

    setLoadingRates(true);
    try {
      const response = await shippingAPI.getCourierRates(
        orderId, 
        selectedWarehouseId,
        parseFloat(weight),
        parseFloat(length),
        parseFloat(breadth),
        parseFloat(height)
      );
      console.log('Shiprocket rates response:', response);
      
      if (response.success && response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Sort by rate (lowest first) and filter out invalid rates
        const sortedRates = [...response.data]
          .filter(c => c && c.rate > 0 && c.courierName)
          .sort((a, b) => a.rate - b.rate);
        setCourierRates(sortedRates);
        // Auto-select cheapest option if shiprocket is selected
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
    if (!selectedWarehouseId || !orderId) return;
    
    // Validate weight before fetching rates
    if (!weight || parseFloat(weight) <= 0) {
      alert('Please enter package weight before fetching rates');
      return;
    }

    setLoadingDelhiveryRate(true);
    try {
      // Fetch DELHIVERY rates for both Express and Surface
      // Use Promise.allSettled to handle errors gracefully
      const [expressResult, surfaceResult] = await Promise.allSettled([
        shippingAPI.getDelhiveryRates(orderId, selectedWarehouseId, 'express', parseFloat(weight)),
        shippingAPI.getDelhiveryRates(orderId, selectedWarehouseId, 'surface', parseFloat(weight)),
      ]);

      console.log('DELHIVERY rates response:', { expressResult, surfaceResult });
      
      const rates: DelhiveryServiceType[] = [];
      
      // Process Express rates
      if (expressResult.status === 'fulfilled') {
        const expressResponse = expressResult.value;
        if (expressResponse?.success && expressResponse?.data && Array.isArray(expressResponse.data) && expressResponse.data.length > 0) {
          const rate = expressResponse.data[0];
          if (rate && rate.rate > 0) {
            rates.push({
              type: 'express',
              rate: rate.rate || 0,
              estimatedDeliveryDays: rate.estimatedDeliveryDays || 0,
              codAvailable: rate.codAvailable || false,
            });
          }
        }
      } else {
        console.warn('Failed to fetch DELHIVERY Express rates:', expressResult.reason);
      }
      
      // Process Surface rates
      if (surfaceResult.status === 'fulfilled') {
        const surfaceResponse = surfaceResult.value;
        if (surfaceResponse?.success && surfaceResponse?.data && Array.isArray(surfaceResponse.data) && surfaceResponse.data.length > 0) {
          const rate = surfaceResponse.data[0];
          if (rate && rate.rate > 0) {
            rates.push({
              type: 'surface',
              rate: rate.rate || 0,
              estimatedDeliveryDays: rate.estimatedDeliveryDays || 0,
              codAvailable: rate.codAvailable || false,
            });
          }
        }
      } else {
        console.warn('Failed to fetch DELHIVERY Surface rates:', surfaceResult.reason);
      }

      if (rates.length > 0) {
        setDelhiveryRates(rates);
        // Auto-select first option if delhivery is selected
        if (selectedShippingProvider === 'delhivery' && !selectedDelhiveryType) {
          setSelectedDelhiveryType(rates[0].type);
        }
      } else {
        console.warn('No DELHIVERY rates available for this route');
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

  // Initialize selected items to all items when modal opens
  useEffect(() => {
    if (isOpen && orderItems.length > 0) {
      setSelectedItemIndices(orderItems.map((_, index) => index));
      // Calculate default weight based on selected items (0.5kg per item)
      const defaultWeight = orderItems.reduce((sum, item) => sum + (item.quantity * 0.5), 0);
      setWeight(defaultWeight.toFixed(2));
      // Default dimensions
      if (!length) setLength('20');
      if (!breadth) setBreadth('15');
      if (!height) setHeight('10');
    }
  }, [isOpen, orderItems]);

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
    onClose();
  };
  
  const toggleItemSelection = (index: number) => {
    setSelectedItemIndices(prev => {
      if (prev.includes(index)) {
        const newSelection = prev.filter(i => i !== index);
        // Recalculate weight based on selected items
        const newWeight = newSelection.reduce((sum, i) => sum + (orderItems[i].quantity * 0.5), 0);
        setWeight(newWeight > 0 ? newWeight.toFixed(2) : '');
        return newSelection;
      } else {
        const newSelection = [...prev, index];
        const newWeight = newSelection.reduce((sum, i) => sum + (orderItems[i].quantity * 0.5), 0);
        setWeight(newWeight.toFixed(2));
        return newSelection;
      }
    });
  };

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

  const getServiceType = (courier: CourierRate) => {
    if (courier.airAvailable && courier.surfaceAvailable) return 'Air + Surface';
    if (courier.airAvailable) return 'Air';
    if (courier.surfaceAvailable) return 'Surface';
    return 'N/A';
  };

  const selectedWarehouse = warehouses.find(w => w._id === selectedWarehouseId);

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
                    {orderItems.map((item, index) => (
                      <div
                        key={index}
                        onClick={() => toggleItemSelection(index)}
                        className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                          selectedItemIndices.includes(index)
                            ? 'border-blue-600 bg-blue-50 shadow-md'
                            : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIndices.includes(index)}
                          onChange={() => toggleItemSelection(index)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm text-gray-900">{item.productName}</p>
                          <p className="text-xs text-gray-500">
                            Size: {item.size} | Qty: {item.quantity} | ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Selected: {selectedItemIndices.length} of {orderItems.length} items
                  </p>
                </div>
              )}

              {/* Package Details */}
              <div className="border-2 border-gray-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
                <label className="block text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaBox className="text-blue-600" size={16} />
                  Package Details *
                </label>
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
                          {courierRates.map((courier) => (
                            <div
                              key={courier.courierCompanyId}
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
