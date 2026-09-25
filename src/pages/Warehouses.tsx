import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPlus, FaEdit, FaTrash, FaWarehouse, FaStore, FaTruck, FaSave, FaTimes, FaSync } from 'react-icons/fa';
import { warehousesAPI } from '../services/api';
import PhoneInput from '../components/PhoneInput';
import CarrierLocationMap from '../components/shipments/CarrierLocationMap';
import { useAuth } from '../contexts/AuthContext';
import {
  Page, PageHeader, EmptyState, FilterChips, BlockSkeleton, downloadCsv, type ChipGroup,
} from '@/components/erp';
import { usePincodeLookup } from '../hooks/usePincodeLookup';

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
      warehouseId?: string;
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
  gstin?: string;
}

/** Safely extract string ID from MongoDB _id (handles ObjectId, object, or string) */
const toIdString = (id: any): string => {
  if (id == null) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id?.toString) return id.toString();
  if (typeof id === 'object' && id?._id) return toIdString(id._id);
  return String(id);
};

const Warehouses: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const { hasPerm } = useAuth();
  // Backend (routes/warehouses.ts): create/update/sync-with-store -> inventory.manage,
  // delete -> inventory.delete. This page has no stock-adjust actions (those live on
  // Inventory.tsx, gated separately -> inventory.adjust). This page had ZERO client-side
  // gating before.
  const canManageWarehouses = hasPerm('inventory.manage');
  const canDeleteWarehouses = hasPerm('inventory.delete');
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
        warehouseId: '',
        enabled: false,
      },
      delhivery: {
        warehouseCode: '', // DELHIVERY warehouse name (string)
        enabled: false,
      },
    },
    gstin: '',
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
      // Backend returns: { success: true, data: warehouses[] }
      // API interceptor normalizes to: warehouses[] or { data: warehouses[] }
      let warehousesData: any[] = [];
      if (Array.isArray(response)) {
        warehousesData = response;
      } else if (response?.success && Array.isArray(response?.data)) {
        warehousesData = response.data;
      } else if (Array.isArray(response?.data)) {
        warehousesData = response.data;
      } else if (Array.isArray(response?.warehouses)) {
        warehousesData = response.warehouses;
      } else if (Array.isArray(response?.data?.warehouses)) {
        warehousesData = response.data.warehouses;
      } else if (Array.isArray(response?.data?.data)) {
        warehousesData = response.data.data;
      }
      setWarehouses(warehousesData);
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
          warehouseId: warehouse.shippingProviders?.shiprocket?.warehouseId || '',
          enabled: warehouse.shippingProviders?.shiprocket?.enabled || false,
        },
        delhivery: {
          warehouseCode: warehouse.shippingProviders?.delhivery?.warehouseCode || '',
          enabled: warehouse.shippingProviders?.delhivery?.enabled || false,
        },
      },
      gstin: warehouse.gstin || '',
      isActive: warehouse.isActive,
      priority: warehouse.priority || 0,
    });
    setShowForm(true);
  };

  const handleDelete = async (warehouse: Warehouse) => {
    if (!confirm('Are you sure you want to delete this warehouse?')) return;
    const id = toIdString(warehouse._id);
    if (!id) return alert('Invalid warehouse ID');
    try {
      await warehousesAPI.delete(id);
      alert('Warehouse deleted successfully!');
      fetchWarehouses();
    } catch (error: any) {
      console.error('Failed to delete warehouse:', error);
      alert(error.response?.data?.message || 'Failed to delete warehouse');
    }
  };

  const handleSyncWithStore = async (warehouse: Warehouse) => {
    if (!confirm('This will sync the warehouse address and contact info with the linked GST store. Continue?')) return;
    const id = toIdString(warehouse._id);
    if (!id) return alert('Invalid warehouse ID');
    try {
      await warehousesAPI.syncWithStore(id, { syncAddress: true, syncContact: true });
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
          warehouseId: '',
          enabled: false,
        },
        delhivery: {
          warehouseCode: '',
          enabled: false,
        },
      },
      gstin: '',
      isActive: true,
      priority: 0,
    });
  };

  /** What the search box and the chips leave on screen. */
  const visibleWarehouses = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return warehouses.filter((w) => {
      if (q && !`${w.name} ${w.code} ${w.address?.city ?? ''} ${w.address?.pincode ?? ''}`.toLowerCase().includes(q)) return false;
      if (statusFilter === 'active' && !w.isActive) return false;
      if (statusFilter === 'inactive' && w.isActive) return false;
      const sr = !!w.shippingProviders?.shiprocket?.enabled;
      const dl = !!w.shippingProviders?.delhivery?.enabled;
      if (providerFilter === 'shiprocket' && !sr) return false;
      if (providerFilter === 'delhivery' && !dl) return false;
      if (providerFilter === 'none' && (sr || dl)) return false;
      return true;
    });
  }, [warehouses, search, statusFilter, providerFilter]);

  /**
   * Pincode -> city + state, the same India Post lookup the checkout and the
   * manual-order form already use. It only fills a field that is empty or
   * still holds what the lookup itself last put there, so a correction typed
   * by hand is never overwritten (the ManualOrderCreate rule).
   */
  const pin = usePincodeLookup(formData.address.pincode, showForm);
  const autofilled = React.useRef<{ city: string; state: string }>({ city: '', state: '' });
  React.useEffect(() => {
    if (!pin.result) return;
    setFormData((prev) => {
      const next = { ...prev, address: { ...prev.address } };
      if (!next.address.city || next.address.city === autofilled.current.city) next.address.city = pin.result!.district;
      if (!next.address.state || next.address.state === autofilled.current.state) next.address.state = pin.result!.state;
      return next;
    });
    autofilled.current = { city: pin.result.district, state: pin.result.state };
  }, [pin.result]);

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

  const chipGroups: ChipGroup[] = [
    {
      key: 'status', label: 'Status', value: statusFilter, onChange: setStatusFilter,
      options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
    },
    {
      key: 'provider', label: 'Courier', value: providerFilter, onChange: setProviderFilter,
      help: 'Which courier can collect from this address.',
      options: [
        { value: 'shiprocket', label: 'Shiprocket set up' },
        { value: 'delhivery', label: 'Delhivery set up' },
        { value: 'none', label: 'No courier yet' },
      ],
    },
  ];

  const exportWarehouses = () => downloadCsv(
    `warehouses-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'city', label: 'City', format: (w: Warehouse) => w.address?.city ?? '' },
      { key: 'state', label: 'State', format: (w: Warehouse) => w.address?.state ?? '' },
      { key: 'pincode', label: 'Pincode', format: (w: Warehouse) => w.address?.pincode ?? '' },
      { key: 'contact', label: 'Contact', format: (w: Warehouse) => w.contact?.name ?? '' },
      { key: 'phone', label: 'Phone', format: (w: Warehouse) => w.contact?.phone ?? '' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'active', label: 'Active', format: (w: Warehouse) => (w.isActive ? 'Yes' : 'No') },
    ],
    visibleWarehouses,
  );

  return (
    <Page width="full">
      <PageHeader
        title="Warehouses"
        description="The addresses you ship from. Each one can have its own courier pickup set up."
        actions={
          <>
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink-soft hover:text-ink"
            >
              <FaArrowLeft className="h-3 w-3" /> Settings
            </button>
            <button
              onClick={exportWarehouses}
              disabled={!visibleWarehouses.length}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink-soft hover:text-ink disabled:opacity-50"
            >
              Export
            </button>
            {canManageWarehouses && (
              <button
                onClick={() => { resetForm(); setEditingWarehouse(null); setShowForm(true); }}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <FaPlus className="h-3.5 w-3.5" /> Add warehouse
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code or city…"
          aria-label="Search warehouses"
          data-testid="warehouses-search"
          className="h-9 w-72 max-w-full rounded-lg border border-line bg-surface px-3 text-sm shadow-sm focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
        />
        <FilterChips groups={chipGroups} onClearAll={() => { setStatusFilter(''); setProviderFilter(''); }} />
        <span className="ml-auto text-sm text-ink-soft">
          {visibleWarehouses.length} of {warehouses.length}
        </span>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 2</label>
                <input
                  type="text"
                  value={formData.address.line2}
                  onChange={(e) => handleChange('address.line2', e.target.value)}
                  placeholder="Apartment, suite, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pincode *
                  {pin.loading && <span className="ml-2 text-xs font-normal text-ink-mute">looking up…</span>}
                  {!pin.loading && pin.result && (
                    <span className="ml-2 text-xs font-normal text-good-ink">city and state filled in</span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  pattern="[0-9]{6}"
                  value={formData.address.pincode}
                  onChange={(e) => handleChange('address.pincode', e.target.value)}
                  placeholder="400001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone *</label>
                <PhoneInput
                  value={formData.contact.phone}
                  dialCode={(formData.contact as any).dialCode}
                  required
                  placeholder="9876543210"
                  onChange={({ number, dialCode }) => {
                    handleChange('contact.phone', number);
                    handleChange('contact.dialCode', dialCode);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                <input
                  type="email"
                  value={formData.contact.email}
                  onChange={(e) => handleChange('contact.email', e.target.value)}
                  placeholder="warehouse@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">GSTIN</label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                  placeholder="e.g. 27AABCU9603R1ZM"
                  maxLength={15}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
                />
                <p className="text-xs text-gray-500 mt-1">GST Identification Number for this warehouse (used in GST Settings for billing)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <input
                  type="number"
                  min="0"
                  value={formData.priority}
                  onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
                  placeholder="0 (lower = higher priority)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-focus"
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
                  <div className="space-y-4">
                    {/* Picked from the locations that actually exist on the connected
                        account — a typed code that doesn't match breaks every booking. */}
                    <CarrierLocationMap
                      provider="shiprocket"
                      active={formData.shippingProviders.shiprocket.enabled}
                      value={formData.shippingProviders.shiprocket.pickupLocation}
                      onChange={(code) => handleChange('shippingProviders.shiprocket.pickupLocation', code)}
                    />
                    <p className="text-xs text-gray-500">
                      Shipments booked from <strong>this</strong> warehouse are picked up from the location selected above.
                    </p>
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
                  <div className="space-y-2">
                    <CarrierLocationMap
                      provider="delhivery"
                      label="Delhivery warehouse"
                      active={formData.shippingProviders.delhivery.enabled}
                      value={formData.shippingProviders.delhivery.warehouseCode}
                      onChange={(code) => handleChange('shippingProviders.delhivery.warehouseCode', code)}
                    />
                    <p className="text-xs text-gray-500">
                      Delhivery identifies pickups by warehouse <em>name</em>, so this must match their record exactly —
                      selecting from the list above guarantees that.
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
              {canManageWarehouses && (
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <FaSave className="w-4 h-4" />
                  {editingWarehouse ? 'Update Warehouse' : 'Create Warehouse'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading && <BlockSkeleton lines={6} />}
        {!loading && visibleWarehouses.map((warehouse) => (
          <div
            key={toIdString(warehouse._id) || warehouse.name}
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
                  {warehouse.gstin && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">GSTIN</p>
                      <p className="text-sm text-gray-900 font-medium">{warehouse.gstin}</p>
                    </div>
                  )}
                </div>

                {/* Shipping Providers */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {warehouse.shippingProviders?.shiprocket?.enabled && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      <FaTruck className="w-3 h-3" />
                      Shiprocket
                      {(warehouse.shippingProviders.shiprocket.warehouseId || warehouse.shippingProviders.shiprocket.pickupLocation) && (
                        <span className="ml-1">
                          ({warehouse.shippingProviders.shiprocket.warehouseId || warehouse.shippingProviders.shiprocket.pickupLocation})
                        </span>
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
                {canManageWarehouses && warehouse.linkedStores && warehouse.linkedStores.length > 0 && (
                  <button
                    onClick={() => handleSyncWithStore(warehouse)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded"
                    title="Sync with GST Store"
                  >
                    <FaSync className="w-5 h-5" />
                  </button>
                )}
                {canManageWarehouses && (
                  <button
                    onClick={() => handleEdit(warehouse)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit"
                  >
                    <FaEdit className="w-5 h-5" />
                  </button>
                )}
                {canDeleteWarehouses && (
                  <button
                    onClick={() => handleDelete(warehouse)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <FaTrash className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {!loading && visibleWarehouses.length === 0 && (
          <div className="rounded-lg border border-line bg-surface">
            <EmptyState
              icon={FaWarehouse as any}
              title={warehouses.length ? 'Nothing matches' : 'No warehouses yet'}
              description={warehouses.length
                ? 'No warehouse matches this search and these filters.'
                : 'A warehouse is an address you ship from. Add the first one to book a courier pickup.'}
              action={warehouses.length
                ? (
                  <button
                    onClick={() => { setSearch(''); setStatusFilter(''); setProviderFilter(''); }}
                    className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-sm"
                  >
                    Clear search and filters
                  </button>
                )
                : canManageWarehouses ? (
                  <button
                    onClick={() => { resetForm(); setEditingWarehouse(null); setShowForm(true); }}
                    className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                  >
                    <FaPlus className="h-3 w-3" /> Add warehouse
                  </button>
                ) : undefined}
            />
          </div>
        )}
      </div>
    </Page>
  );
};

export default Warehouses;

