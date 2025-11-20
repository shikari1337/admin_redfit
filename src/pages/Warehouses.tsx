import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPlus, FaEdit, FaTrash, FaWarehouse, FaStore, FaTruck, FaSave, FaTimes, FaSync } from 'react-icons/fa';
import { warehousesAPI } from '../services/api';

interface Warehouse {
  _id: string;
  name: string;
  code: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  contact: {
    name: string;
    phone: string;
    email?: string;
  };
  shippingProviders: {
    shiprocket?: {
      pickupLocation?: string;
      enabled: boolean;
    };
    delhivery?: {
      warehouseCode?: string; // DELHIVERY warehouse name (string) as per API
      enabled: boolean;
    };
  };
  storeIds?: string[];
  isActive: boolean;
  priority?: number;
  linkedStores?: Array<{ name: string; storeIndex: number }>;
}

const Warehouses: React.FC = () => {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
    },
    contact: {
      name: '',
      phone: '',
      email: '',
    },
    shippingProviders: {
      shiprocket: {
        pickupLocation: '',
        enabled: false,
      },
      delhivery: {
        warehouseCode: '', // DELHIVERY warehouse name (string)
        enabled: false,
      },
    },
    isActive: true,
    priority: 0,
  });

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const response = await warehousesAPI.getAll();
      if (response.success) {
        setWarehouses(response.data?.warehouses || response.data || []);
      } else {
        setWarehouses(response.data || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch warehouses:', error);
      alert('Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingWarehouse) {
        await warehousesAPI.update(editingWarehouse._id, formData);
        alert('Warehouse updated successfully!');
      } else {
        await warehousesAPI.create(formData);
        alert('Warehouse created successfully!');
      }
      setShowForm(false);
      setEditingWarehouse(null);
      resetForm();
      fetchWarehouses();
    } catch (error: any) {
      console.error('Failed to save warehouse:', error);
      alert(error.response?.data?.message || 'Failed to save warehouse');
    }
  };

  const handleEdit = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setFormData({
      name: warehouse.name,
      code: warehouse.code,
      address: {
        ...warehouse.address,
        line2: warehouse.address.line2 || '',
      },
      contact: {
        ...warehouse.contact,
        email: warehouse.contact.email || '',
      },
      shippingProviders: {
        shiprocket: {
          pickupLocation: warehouse.shippingProviders?.shiprocket?.pickupLocation || '',
          enabled: warehouse.shippingProviders?.shiprocket?.enabled || false,
        },
        delhivery: {
          warehouseCode: warehouse.shippingProviders?.delhivery?.warehouseCode || '',
          enabled: warehouse.shippingProviders?.delhivery?.enabled || false,
        },
      },
      isActive: warehouse.isActive,
      priority: warehouse.priority || 0,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this warehouse?')) return;
    try {
      await warehousesAPI.delete(id);
      alert('Warehouse deleted successfully!');
      fetchWarehouses();
    } catch (error: any) {
      console.error('Failed to delete warehouse:', error);
      alert(error.response?.data?.message || 'Failed to delete warehouse');
    }
  };

  const handleSyncWithStore = async (warehouseId: string) => {
    if (!confirm('This will sync the warehouse address and contact info with the linked GST store. Continue?')) return;
    try {
      await warehousesAPI.syncWithStore(warehouseId, { syncAddress: true, syncContact: true });
      alert('Warehouse synced with GST store successfully!');
      fetchWarehouses();
    } catch (error: any) {
      console.error('Failed to sync warehouse:', error);
      alert(error.response?.data?.message || 'Failed to sync warehouse');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
      },
      contact: {
        name: '',
        phone: '',
        email: '',
      },
      shippingProviders: {
        shiprocket: {
          pickupLocation: '',
          enabled: false,
        },
        delhivery: {
          warehouseCode: '',
          enabled: false,
        },
      },
      isActive: true,
      priority: 0,
    });
  };

  const handleChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [section, key, subKey] = field.split('.');
      setFormData(prev => {
        const sectionValue = prev[section as keyof typeof prev] as any;
        if (!sectionValue || typeof sectionValue !== 'object') {
          return prev;
        }
        return {
          ...prev,
          [section]: {
            ...sectionValue,
            [key]: subKey
              ? {
                  ...(sectionValue[key] || {}),
                  [subKey]: value,
                }
              : value,
          },
        };
      });
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Warehouses</h1>
            <p className="text-sm text-gray-600 mt-2">Manage warehouse locations and shipping provider configurations</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setEditingWarehouse(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            <FaPlus className="w-4 h-4" />
            Add Warehouse
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}
            </h2>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingWarehouse(null);
                resetForm();
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Warehouse Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Mumbai Warehouse"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Warehouse Code *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                  placeholder="WH001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 1 *</label>
                <input
                  type="text"
                  required
                  value={formData.address.line1}
                  onChange={(e) => handleChange('address.line1', e.target.value)}
                  placeholder="Street address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 2</label>
                <input
                  type="text"
                  value={formData.address.line2}
                  onChange={(e) => handleChange('address.line2', e.target.value)}
                  placeholder="Apartment, suite, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
                <input
                  type="text"
                  required
                  value={formData.address.city}
                  onChange={(e) => handleChange('address.city', e.target.value)}
                  placeholder="Mumbai"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                <input
                  type="text"
                  required
                  value={formData.address.state}
                  onChange={(e) => handleChange('address.state', e.target.value)}
                  placeholder="Maharashtra"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pincode *</label>
                <input
                  type="text"
                  required
                  pattern="[0-9]{6}"
                  value={formData.address.pincode}
                  onChange={(e) => handleChange('address.pincode', e.target.value)}
                  placeholder="400001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Name *</label>
                <input
                  type="text"
                  required
                  value={formData.contact.name}
                  onChange={(e) => handleChange('contact.name', e.target.value)}
                  placeholder="Warehouse Manager"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone *</label>
                <input
                  type="tel"
                  required
                  value={formData.contact.phone}
                  onChange={(e) => handleChange('contact.phone', e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                <input
                  type="email"
                  value={formData.contact.email}
                  onChange={(e) => handleChange('contact.email', e.target.value)}
                  placeholder="warehouse@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <input
                  type="number"
                  min="0"
                  value={formData.priority}
                  onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
                  placeholder="0 (lower = higher priority)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="text-xs text-gray-500 mt-1">Lower number = higher priority for auto-selection</p>
              </div>
            </div>

            {/* Shipping Providers Configuration */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Shipping Providers Configuration</h3>
              
              {/* Shiprocket */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FaTruck className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold text-gray-900">Shiprocket</h4>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.shippingProviders.shiprocket.enabled}
                      onChange={(e) => handleChange('shippingProviders.shiprocket.enabled', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Enable</span>
                  </label>
                </div>
                {formData.shippingProviders.shiprocket.enabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pickup Location Name</label>
                    <input
                      type="text"
                      value={formData.shippingProviders.shiprocket.pickupLocation}
                      onChange={(e) => handleChange('shippingProviders.shiprocket.pickupLocation', e.target.value)}
                      placeholder="Default Location"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                )}
              </div>

              {/* DELHIVERY */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FaTruck className="w-5 h-5 text-orange-600" />
                    <h4 className="font-semibold text-gray-900">DELHIVERY</h4>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.shippingProviders.delhivery.enabled}
                      onChange={(e) => handleChange('shippingProviders.delhivery.enabled', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Enable</span>
                  </label>
                </div>
                {formData.shippingProviders.delhivery.enabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      DELHIVERY Warehouse Name * <span className="text-xs text-gray-500">(As registered with DELHIVERY)</span>
                    </label>
                    <input
                      type="text"
                      required={formData.shippingProviders.delhivery.enabled}
                      value={formData.shippingProviders.delhivery.warehouseCode}
                      onChange={(e) => handleChange('shippingProviders.delhivery.warehouseCode', e.target.value)}
                      placeholder="Enter exact warehouse name as registered with DELHIVERY"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This must match exactly with the warehouse name registered in your DELHIVERY account. Contact your DELHIVERY SPOC if unsure.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => handleChange('isActive', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingWarehouse(null);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                <FaSave className="w-4 h-4" />
                {editingWarehouse ? 'Update Warehouse' : 'Create Warehouse'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {warehouses.map((warehouse) => (
          <div
            key={warehouse._id}
            className={`bg-white rounded-lg shadow-sm border ${
              warehouse.isActive ? 'border-gray-200' : 'border-gray-300 opacity-60'
            } p-6`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <FaWarehouse className={`w-6 h-6 ${warehouse.isActive ? 'text-red-600' : 'text-gray-400'}`} />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{warehouse.name}</h3>
                    <p className="text-sm text-gray-500">Code: {warehouse.code}</p>
                    {warehouse.linkedStores && warehouse.linkedStores.length > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <FaStore className="w-3 h-3 text-blue-600" />
                        <span className="text-xs text-blue-600">
                          Linked to GST Store: {warehouse.linkedStores.map((s: any) => s.name).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                  {!warehouse.isActive && (
                    <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded">Inactive</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Address</p>
                    <p className="text-sm text-gray-900">
                      {warehouse.address.line1}
                      {warehouse.address.line2 && `, ${warehouse.address.line2}`}
                      <br />
                      {warehouse.address.city}, {warehouse.address.state} {warehouse.address.pincode}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Contact</p>
                    <p className="text-sm text-gray-900">
                      {warehouse.contact.name}
                      <br />
                      {warehouse.contact.phone}
                      {warehouse.contact.email && (
                        <>
                          <br />
                          {warehouse.contact.email}
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Shipping Providers */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {warehouse.shippingProviders?.shiprocket?.enabled && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      <FaTruck className="w-3 h-3" />
                      Shiprocket
                      {warehouse.shippingProviders.shiprocket.pickupLocation && (
                        <span className="ml-1">({warehouse.shippingProviders.shiprocket.pickupLocation})</span>
                      )}
                    </span>
                  )}
                  {warehouse.shippingProviders?.delhivery?.enabled && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                      <FaTruck className="w-3 h-3" />
                      DELHIVERY
                      {warehouse.shippingProviders.delhivery.warehouseCode && (
                        <span className="ml-1">({warehouse.shippingProviders.delhivery.warehouseCode})</span>
                      )}
                    </span>
                  )}
                  {(!warehouse.shippingProviders?.shiprocket?.enabled &&
                    !warehouse.shippingProviders?.delhivery?.enabled) && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">No providers enabled</span>
                  )}
                </div>

                {/* Linked Stores */}
                {warehouse.linkedStores && warehouse.linkedStores.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Linked Stores</p>
                    <div className="flex flex-wrap gap-2">
                      {warehouse.linkedStores.map((store, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                        >
                          <FaStore className="w-3 h-3" />
                          {store.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {warehouse.priority !== undefined && (
                  <p className="text-xs text-gray-500">Priority: {warehouse.priority}</p>
                )}
              </div>

              <div className="flex gap-2 ml-4">
                {warehouse.linkedStores && warehouse.linkedStores.length > 0 && (
                  <button
                    onClick={() => handleSyncWithStore(warehouse._id)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded"
                    title="Sync with GST Store"
                  >
                    <FaSync className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => handleEdit(warehouse)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit"
                >
                  <FaEdit className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(warehouse._id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <FaTrash className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {warehouses.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <FaWarehouse className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No warehouses found</p>
            <button
              onClick={() => {
                resetForm();
                setEditingWarehouse(null);
                setShowForm(true);
              }}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 mx-auto"
            >
              <FaPlus className="w-4 h-4" />
              Add First Warehouse
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Warehouses;

