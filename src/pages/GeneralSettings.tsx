import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaGlobe, FaImage, FaPalette, FaInstagram } from 'react-icons/fa';
import api from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';

const GeneralSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    general: {
      websiteUrl: '',
      siteName: '',
      siteDescription: '',
    },
    logo: {
      logoUrl: '',
      faviconUrl: '',
      adminLogoUrl: '',
    },
    colors: {
      primaryColor: '#EF4444',
      secondaryColor: '#F59E0B',
      accentColor: '#10B981',
      backgroundColor: '#FFFFFF',
      textColor: '#111827',
      linkColor: '#3B82F6',
    },
    instagram: {
      username: '',
      isEnabled: false,
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
        setFormData({
          general: {
            websiteUrl: settings.general?.websiteUrl || '',
            siteName: settings.general?.siteName || '',
            siteDescription: settings.general?.siteDescription || '',
          },
          logo: {
            logoUrl: settings.logo?.logoUrl || '',
            faviconUrl: settings.logo?.faviconUrl || '',
            adminLogoUrl: settings.logo?.adminLogoUrl || '',
          },
          colors: {
            primaryColor: settings.colors?.primaryColor || '#EF4444',
            secondaryColor: settings.colors?.secondaryColor || '#F59E0B',
            accentColor: settings.colors?.accentColor || '#10B981',
            backgroundColor: settings.colors?.backgroundColor || '#FFFFFF',
            textColor: settings.colors?.textColor || '#111827',
            linkColor: settings.colors?.linkColor || '#3B82F6',
          },
          instagram: {
            username: settings.instagram?.username || '',
            isEnabled: settings.instagram?.isEnabled || false,
          },
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Ensure instagram config is properly structured
      const settingsToSave = {
        general: formData.general,
        logo: formData.logo,
        colors: formData.colors,
        instagram: formData.instagram,
      };
      
      const response = await api.put('/settings', settingsToSave);
      if (response.data.success) {
        alert('Settings saved successfully!');
      } else {
        alert('Settings saved but response format unexpected');
      }
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Failed to save settings';
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (section: string, field: string, value: string | boolean) => {
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <h1 className="text-3xl font-bold text-gray-900">General Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Configure website URL, logo, and color scheme</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FaGlobe className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">General Information</h2>
              <p className="text-sm text-gray-600">Website URL and site information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website URL
              </label>
              <input
                type="text"
                value={formData.general.websiteUrl}
                onChange={(e) => handleChange('general', 'websiteUrl', e.target.value)}
                placeholder="https://redfit.in"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">Your live website URL (e.g., https://redfit.in)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site Name
              </label>
              <input
                type="text"
                value={formData.general.siteName}
                onChange={(e) => handleChange('general', 'siteName', e.target.value)}
                placeholder="Redfit"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site Description
              </label>
              <textarea
                value={formData.general.siteDescription}
                onChange={(e) => handleChange('general', 'siteDescription', e.target.value)}
                placeholder="Premium apparel and fashion store"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
        </div>

        {/* Logo Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FaImage className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Logo & Icons</h2>
              <p className="text-sm text-gray-600">Configure logo URLs for website and admin panel</p>
            </div>
          </div>

          <div className="space-y-4">
            <ImageInputWithActions
              value={formData.logo.logoUrl}
              onChange={(url) => handleChange('logo', 'logoUrl', url)}
              label="Main Logo URL"
              placeholder="https://cdn.redfit.in/logo.png"
            />

            <ImageInputWithActions
              value={formData.logo.faviconUrl}
              onChange={(url) => handleChange('logo', 'faviconUrl', url)}
              label="Favicon URL"
              placeholder="https://cdn.redfit.in/favicon.ico"
            />

            <ImageInputWithActions
              value={formData.logo.adminLogoUrl}
              onChange={(url) => handleChange('logo', 'adminLogoUrl', url)}
              label="Admin Logo URL"
              placeholder="https://cdn.redfit.in/admin-logo.png"
            />
          </div>
        </div>

        {/* Color Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
              <FaPalette className="w-6 h-6 text-pink-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Color Scheme</h2>
              <p className="text-sm text-gray-600">Configure brand colors for your website</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.primaryColor}
                  onChange={(e) => handleChange('colors', 'primaryColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.primaryColor}
                  onChange={(e) => handleChange('colors', 'primaryColor', e.target.value)}
                  placeholder="#EF4444"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secondary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.secondaryColor}
                  onChange={(e) => handleChange('colors', 'secondaryColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.secondaryColor}
                  onChange={(e) => handleChange('colors', 'secondaryColor', e.target.value)}
                  placeholder="#F59E0B"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.accentColor}
                  onChange={(e) => handleChange('colors', 'accentColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.accentColor}
                  onChange={(e) => handleChange('colors', 'accentColor', e.target.value)}
                  placeholder="#10B981"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Background Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.backgroundColor}
                  onChange={(e) => handleChange('colors', 'backgroundColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.backgroundColor}
                  onChange={(e) => handleChange('colors', 'backgroundColor', e.target.value)}
                  placeholder="#FFFFFF"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.textColor}
                  onChange={(e) => handleChange('colors', 'textColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.textColor}
                  onChange={(e) => handleChange('colors', 'textColor', e.target.value)}
                  placeholder="#111827"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Link Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.linkColor}
                  onChange={(e) => handleChange('colors', 'linkColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.linkColor}
                  onChange={(e) => handleChange('colors', 'linkColor', e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Instagram Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <FaInstagram className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Instagram Feed</h2>
              <p className="text-sm text-gray-600">Configure Instagram account for dynamic feed</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="instagramEnabled"
                checked={formData.instagram.isEnabled}
                onChange={(e) => handleChange('instagram', 'isEnabled', e.target.checked)}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <label htmlFor="instagramEnabled" className="text-sm font-medium text-gray-700">
                Enable Instagram Feed
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instagram Username
              </label>
              <input
                type="text"
                value={formData.instagram.username}
                onChange={(e) => handleChange('instagram', 'username', e.target.value)}
                placeholder="thestreetwear_clothings"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={!formData.instagram.isEnabled}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter Instagram username without @ (e.g., thestreetwear_clothings)
              </p>
            </div>
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
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 font-medium flex items-center gap-2"
          >
            <FaSave className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GeneralSettings;

