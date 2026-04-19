import React, { useEffect, useState } from 'react';
import { FaTruck, FaSpinner, FaTimes } from 'react-icons/fa';
import { warehousesAPI } from '../../services/api';

interface Warehouse {
  _id: string;
  name: string;
  code: string;
  isActive: boolean;
  shippingProviders?: {
    shiprocket?: { enabled: boolean };
    delhivery?: { enabled: boolean; warehouseCode?: string };
  };
}

interface CreateShipmentModalProps {
  isOpen: boolean;
  order: {
    _id: string;
    orderId: string;
    shippingAddress?: {
      fullName?: string;
      district?: string;
      city?: string;
      pincode?: string;
    };
    total?: number;
    paymentMethod?: string;
  } | null;
  onClose: () => void;
  onSubmit: (data: {
    orderIds: string[];
    warehouseId: string;
    shippingProvider: 'delhivery' | 'shiprocket' | 'manual';
    delhiveryServiceType?: 'express' | 'surface';
    weight?: number;
    length?: number;
    breadth?: number;
    height?: number;
  }) => void;
  loading: boolean;
}

const CreateShipmentModal: React.FC<CreateShipmentModalProps> = ({
  isOpen,
  order,
  onClose,
  onSubmit,
  loading,
}) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<'delhivery' | 'shiprocket' | 'manual'>('delhivery');
  const [delhiveryServiceType, setDelhiveryServiceType] = useState<'express' | 'surface'>('surface');
  const [weight, setWeight] = useState('0.5');
  const [length, setLength] = useState('20');
  const [breadth, setBreadth] = useState('15');
  const [height, setHeight] = useState('10');
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchWarehouses();
    }
  }, [isOpen]);

  const fetchWarehouses = async () => {
    setLoadingWarehouses(true);
    try {
      const response = await warehousesAPI.getAll();
      let data: Warehouse[] = [];
      if (Array.isArray(response)) data = response;
      else if (Array.isArray(response?.data)) data = response.data;
      else if (Array.isArray(response?.data?.data)) data = response.data.data;

      const active = data.filter(w => w.isActive !== false);
      setWarehouses(active);
      if (active.length > 0 && !selectedWarehouse) {
        setSelectedWarehouse(active[0]._id);
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const handleSubmit = () => {
    if (!order || !selectedWarehouse) return;

    const data: any = {
      orderIds: [order._id],
      warehouseId: selectedWarehouse,
      shippingProvider: selectedProvider,
      weight: parseFloat(weight) || 0.5,
      length: parseFloat(length) || 20,
      breadth: parseFloat(breadth) || 15,
      height: parseFloat(height) || 10,
    };

    if (selectedProvider === 'delhivery') {
      data.delhiveryServiceType = delhiveryServiceType;
    }

    onSubmit(data);
  };

  if (!isOpen || !order) return null;

  const destination = order.shippingAddress
    ? `${order.shippingAddress.district || order.shippingAddress.city || ''}, ${order.shippingAddress.pincode || ''}`
    : 'N/A';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FaTruck className="text-blue-600" />
            <h3 className="text-lg font-semibold">Create Shipment</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FaTimes />
          </button>
        </div>

        {/* Order Info */}
        <div className="px-6 py-3 bg-gray-50 border-b text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Order:</span>
            <span className="font-medium">{order.orderId}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Customer:</span>
            <span>{order.shippingAddress?.fullName || 'N/A'}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Destination:</span>
            <span>{destination}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Amount:</span>
            <span className="font-medium">{order.total != null ? `₹${order.total.toFixed(2)}` : 'N/A'}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Payment:</span>
            <span className="uppercase text-xs font-medium">{order.paymentMethod || 'N/A'}</span>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Warehouse */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
            {loadingWarehouses ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <FaSpinner className="animate-spin" /> Loading warehouses...
              </div>
            ) : (
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {warehouses.map(w => (
                  <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                ))}
              </select>
            )}
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as any)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="delhivery">Delhivery</option>
              <option value="shiprocket">Shiprocket</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          {/* Delhivery Service Type */}
          {selectedProvider === 'delhivery' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="delhiveryType"
                    value="surface"
                    checked={delhiveryServiceType === 'surface'}
                    onChange={() => setDelhiveryServiceType('surface')}
                    className="text-blue-600"
                  />
                  <span className="text-sm">Surface (3-5 days)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="delhiveryType"
                    value="express"
                    checked={delhiveryServiceType === 'express'}
                    onChange={() => setDelhiveryServiceType('express')}
                    className="text-blue-600"
                  />
                  <span className="text-sm">Express (1-2 days)</span>
                </label>
              </div>
            </div>
          )}

          {/* Dimensions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Package Dimensions</label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Weight (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  step="0.1"
                  min="0.1"
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">L (cm)</label>
                <input
                  type="number"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  min="1"
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">B (cm)</label>
                <input
                  type="number"
                  value={breadth}
                  onChange={(e) => setBreadth(e.target.value)}
                  min="1"
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">H (cm)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  min="1"
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedWarehouse}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <FaTruck />
                Create Shipment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateShipmentModal;
