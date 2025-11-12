import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaCreditCard, FaMobile, FaHandHoldingUsd } from 'react-icons/fa';

import api from '../services/api';

const PaymentGatewaySettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    razorpay: {
      useEnvVars: false,
      keyId: '',
      keySecret: '',
      isEnabled: false,
    },
    upi: {
      isEnabled: false,
      upiId: '',
      payeeName: '',
      apps: [
        { name: 'PhonePe', urlTemplate: 'phonepe://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
        { name: 'Google Pay', urlTemplate: 'tez://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
        { name: 'Paytm', urlTemplate: 'paytmmp://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
        { name: 'BHIM', urlTemplate: 'bhim://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
        { name: 'Amazon Pay', urlTemplate: 'amazonpay://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
      ],
    },
    manualPayment: {
      isEnabled: false,
      instructions: '',
      accountDetails: '',
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      if (response.data.success && response.data.data) {
        const settings = response.data.data;
        
        // Razorpay settings
        if (settings.razorpay) {
          setFormData(prev => ({
            ...prev,
            razorpay: {
              ...prev.razorpay,
              useEnvVars: settings.razorpay.useEnvVars || false,
              keyId: settings.razorpay.keyIdSet ? '••••••••' : '',
              keySecret: settings.razorpay.keySecretSet ? '••••••••' : '',
              isEnabled: settings.razorpay.isEnabled || false,
            },
          }));
        }

        // UPI settings
        if (settings.upi) {
          setFormData(prev => ({
            ...prev,
            upi: {
              ...prev.upi,
              isEnabled: settings.upi.isEnabled || false,
              upiId: settings.upi.upiId || '',
              payeeName: settings.upi.payeeName || '',
              apps: settings.upi.apps && settings.upi.apps.length > 0 
                ? settings.upi.apps 
                : prev.upi.apps || [
                    { name: 'PhonePe', urlTemplate: 'phonepe://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
                    { name: 'Google Pay', urlTemplate: 'tez://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
                    { name: 'Paytm', urlTemplate: 'paytmmp://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
                    { name: 'BHIM', urlTemplate: 'bhim://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
                    { name: 'Amazon Pay', urlTemplate: 'amazonpay://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
                  ],
            },
          }));
        }

        // Manual Payment settings
        if (settings.manualPayment) {
          setFormData(prev => ({
            ...prev,
            manualPayment: {
              ...prev.manualPayment,
              isEnabled: settings.manualPayment.isEnabled !== false, // Default to true
              instructions: settings.manualPayment.instructions || '',
              accountDetails: settings.manualPayment.accountDetails || '',
            },
          }));
        } else {
          // Initialize with defaults if not set
          setFormData(prev => ({
            ...prev,
            manualPayment: {
              ...prev.manualPayment,
              isEnabled: true,
              instructions: 'Please transfer the payment amount to our bank account. Order will be processed after payment verification.',
              accountDetails: 'Bank transfer, NEFT, IMPS accepted',
            },
          }));
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const response = await api.put('/settings', formData);
      if (response.data.success) {
        alert('Payment gateway settings saved successfully!');
        fetchSettings();
      } else {
        alert('Failed to save settings. Please try again.');
      }
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev],
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Payment Gateway Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Configure and enable/disable payment gateways</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Razorpay Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FaCreditCard className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Razorpay</h2>
                <p className="text-sm text-gray-600">Online payment gateway</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.razorpay.isEnabled}
                onChange={(e) => handleChange('razorpay', 'isEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          {formData.razorpay.isEnabled && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key ID
                </label>
                <input
                  type="text"
                  value={formData.razorpay.keyId}
                  onChange={(e) => handleChange('razorpay', 'keyId', e.target.value)}
                  placeholder="Enter Razorpay Key ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key Secret
                </label>
                <input
                  type="password"
                  value={formData.razorpay.keySecret}
                  onChange={(e) => handleChange('razorpay', 'keySecret', e.target.value)}
                  placeholder="Enter Razorpay Key Secret"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.razorpay.useEnvVars}
                  onChange={(e) => handleChange('razorpay', 'useEnvVars', e.target.checked)}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <label className="ml-2 text-sm text-gray-700">
                  Use environment variables instead
                </label>
              </div>
            </div>
          )}
        </div>

        {/* UPI Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <FaMobile className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">UPI</h2>
                <p className="text-sm text-gray-600">Manual prepaid UPI payment</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.upi.isEnabled}
                onChange={(e) => handleChange('upi', 'isEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          {formData.upi.isEnabled && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  UPI ID
                </label>
                <input
                  type="text"
                  value={formData.upi.upiId}
                  onChange={(e) => handleChange('upi', 'upiId', e.target.value)}
                  placeholder="e.g., yespay.mabs0517619IKIT2728@yesbankltd"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Your UPI payment address (VPA)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payee Name
                </label>
                <input
                  type="text"
                  value={formData.upi.payeeName}
                  onChange={(e) => handleChange('upi', 'payeeName', e.target.value)}
                  placeholder="e.g., REDFIT_GROWCORD"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Name shown to customers when making payment
                </p>
              </div>

              {/* UPI Apps Configuration */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">UPI Apps Configuration</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configure URL templates for 5 UPI payment apps. Use variables: {'{upiId}'}, {'{payeeName}'}, {'{amount}'}, {'{transactionNote}'}
                </p>
                <div className="space-y-4">
                  {formData.upi.apps && formData.upi.apps.map((app, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={app.enabled}
                            onChange={(e) => {
                              const newApps = [...formData.upi.apps];
                              newApps[index].enabled = e.target.checked;
                              handleChange('upi', 'apps', newApps);
                            }}
                            className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                          />
                          <label className="text-sm font-medium text-gray-700">
                            {app.name}
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            App Name
                          </label>
                          <input
                            type="text"
                            value={app.name}
                            onChange={(e) => {
                              const newApps = [...formData.upi.apps];
                              newApps[index].name = e.target.value;
                              handleChange('upi', 'apps', newApps);
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                            placeholder="e.g., PhonePe"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            URL Template
                          </label>
                          <input
                            type="text"
                            value={app.urlTemplate}
                            onChange={(e) => {
                              const newApps = [...formData.upi.apps];
                              newApps[index].urlTemplate = e.target.value;
                              handleChange('upi', 'apps', newApps);
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-xs"
                            placeholder="e.g., phonepe://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Use variables: {'{upiId}'}, {'{payeeName}'}, {'{amount}'}, {'{transactionNote}'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Manual Payment Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <FaHandHoldingUsd className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Manual Payment</h2>
                <p className="text-sm text-gray-600">Bank transfer, NEFT, IMPS, or other manual payment methods</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.manualPayment.isEnabled}
                onChange={(e) => handleChange('manualPayment', 'isEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          {formData.manualPayment.isEnabled && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Instructions
                </label>
                <textarea
                  value={formData.manualPayment.instructions}
                  onChange={(e) => handleChange('manualPayment', 'instructions', e.target.value)}
                  placeholder="e.g., Please transfer the payment amount to our bank account. Order will be processed after payment verification."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Instructions shown to customers when they select manual payment
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Details
                </label>
                <textarea
                  value={formData.manualPayment.accountDetails}
                  onChange={(e) => handleChange('manualPayment', 'accountDetails', e.target.value)}
                  placeholder="e.g., Bank transfer, NEFT, IMPS accepted"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Payment methods accepted (shown to customers)
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaSave className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PaymentGatewaySettings;

