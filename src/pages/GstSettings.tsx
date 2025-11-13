import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaPercent, FaPlus, FaTrash, FaEdit, FaCheck, FaTimes, FaWarehouse } from 'react-icons/fa';
import api, { gstSettingsAPI } from '../services/api';

interface TaxBracket {
  _id?: string;
  name: string;
  rate: number;
  isActive: boolean;
}

const GstSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPriceIncludingGst, setShowPriceIncludingGst] = useState(false);
  const [showGstOnCheckout, setShowGstOnCheckout] = useState(true);
  const [taxBrackets, setTaxBrackets] = useState<TaxBracket[]>([]);
  const [editingBracket, setEditingBracket] = useState<string | null>(null);
  const [newBracket, setNewBracket] = useState({ name: '', rate: 0, isActive: true });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const settings = await gstSettingsAPI.get();
      if (settings) {
        setShowPriceIncludingGst(settings.showPriceIncludingGst || false);
        setShowGstOnCheckout(settings.showGstOnCheckout !== undefined ? settings.showGstOnCheckout : true);
        setTaxBrackets(settings.taxBrackets || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch GST settings:', error);
      if (error.response?.status !== 404) {
        alert('Failed to load GST settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await gstSettingsAPI.update({
        showPriceIncludingGst,
        showGstOnCheckout,
        taxBrackets,
      });
      alert('GST settings saved successfully!');
    } catch (error: any) {
      console.error('Failed to save GST settings:', error);
      alert(error.response?.data?.message || 'Failed to save GST settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBracket = () => {
    if (!newBracket.name || newBracket.rate <= 0) {
      alert('Please enter bracket name and rate');
      return;
    }
    setTaxBrackets([...taxBrackets, { ...newBracket, _id: `temp-${Date.now()}` }]);
    setNewBracket({ name: '', rate: 0, isActive: true });
  };

  const handleUpdateBracket = (id: string) => {
    const bracket = taxBrackets.find(b => b._id === id);
    if (!bracket) return;
    
    if (!bracket.name || bracket.rate <= 0) {
      alert('Please enter bracket name and rate');
      return;
    }
    
    setEditingBracket(null);
  };

  const handleDeleteBracket = (id: string) => {
    if (window.confirm('Are you sure you want to delete this tax bracket?')) {
      setTaxBrackets(taxBrackets.filter(b => b._id !== id));
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
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <h1 className="text-3xl font-bold text-gray-900">GST Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Configure GST tax brackets. Warehouses act as GST stores - manage them in the Warehouses section.</p>
      </div>

      {/* Show Price Including GST */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Show Price Including GST</h2>
            <p className="text-sm text-gray-600">Display product prices with GST included on the frontend</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showPriceIncludingGst}
              onChange={(e) => setShowPriceIncludingGst(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>
      </div>

      {/* Show GST on Checkout */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Show GST on Checkout</h2>
            <p className="text-sm text-gray-600">Display GST calculation breakdown on checkout page</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showGstOnCheckout}
              onChange={(e) => setShowGstOnCheckout(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>
      </div>

      {/* Tax Brackets */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <FaPercent className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Tax Brackets</h2>
            <p className="text-sm text-gray-600">Configure GST tax rates (e.g., 5%, 12%, 18%, 28%)</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Existing Brackets */}
          {taxBrackets.map((bracket) => (
            <div key={bracket._id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
              {editingBracket === bracket._id ? (
                <>
                  <input
                    type="text"
                    value={bracket.name}
                    onChange={(e) => setTaxBrackets(taxBrackets.map(b => 
                      b._id === bracket._id ? { ...b, name: e.target.value } : b
                    ))}
                    placeholder="Bracket Name (e.g., 18% GST)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <input
                    type="number"
                    value={bracket.rate}
                    onChange={(e) => setTaxBrackets(taxBrackets.map(b => 
                      b._id === bracket._id ? { ...b, rate: parseFloat(e.target.value) || 0 } : b
                    ))}
                    placeholder="Rate %"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={bracket.isActive}
                      onChange={(e) => setTaxBrackets(taxBrackets.map(b => 
                        b._id === bracket._id ? { ...b, isActive: e.target.checked } : b
                      ))}
                      className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                  <button
                    onClick={() => handleUpdateBracket(bracket._id!)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded"
                  >
                    <FaCheck />
                  </button>
                  <button
                    onClick={() => setEditingBracket(null)}
                    className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                  >
                    <FaTimes />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{bracket.name}</div>
                    <div className="text-sm text-gray-500">{bracket.rate}%</div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    bracket.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {bracket.isActive ? 'Active' : 'Inactive'}
                  </div>
                  <button
                    onClick={() => setEditingBracket(bracket._id!)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDeleteBracket(bracket._id!)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <FaTrash />
                  </button>
                </>
              )}
            </div>
          ))}

          {/* Add New Bracket */}
          <div className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-300 rounded-lg">
            <input
              type="text"
              value={newBracket.name}
              onChange={(e) => setNewBracket({ ...newBracket, name: e.target.value })}
              placeholder="Bracket Name (e.g., 18% GST)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <input
              type="number"
              value={newBracket.rate}
              onChange={(e) => setNewBracket({ ...newBracket, rate: parseFloat(e.target.value) || 0 })}
              placeholder="Rate %"
              min="0"
              max="100"
              step="0.01"
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newBracket.isActive}
                onChange={(e) => setNewBracket({ ...newBracket, isActive: e.target.checked })}
                className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
            <button
              onClick={handleAddBracket}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
            >
              <FaPlus /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Warehouses Info */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <FaWarehouse className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">GST Stores (Warehouses)</h2>
            <p className="text-sm text-gray-600">Warehouses act as GST stores. Manage warehouses in the <strong>Warehouses</strong> section.</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> GST calculation now uses warehouses instead of separate stores. Each warehouse can have a GSTIN configured. 
            Go to <strong>Settings → Warehouses</strong> to manage warehouse locations and configure GSTIN for each warehouse.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 font-medium flex items-center gap-2"
        >
          <FaSave className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default GstSettings;
