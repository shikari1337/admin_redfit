import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {ArrowLeft, Save, Globe, ImageIcon, Palette, Instagram, Type as TypeIcon, Menu as MenuIcon, Plus, Trash2, ArrowUp, ArrowDown, Loader2} from 'lucide-react';
import api from '../services/api';
import { categoriesAPI, pagesAPI } from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import MegaMenuEditor from '../components/menu/MegaMenuEditor';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

interface MenuItem {
  label: string;
  type: 'link' | 'category' | 'page';
  target?: string;
  order: number;
  isVisible: boolean;
  openInNewTab?: boolean;
  megaMenu?: {
    isMegaMenu?: boolean;
    layout?: 'columns' | 'grid' | 'tabs';
    columns?: Array<{
      title?: string;
      links: Array<{
        label: string;
        type: 'link' | 'category' | 'page';
        target?: string;
        openInNewTab?: boolean;
      }>;
    }>;
    featuredImage?: string;
    featuredImageLink?: string;
    featuredImageAlt?: string;
  };
}

interface FormData {
  general: {
    websiteUrl: string;
    siteName: string;
    siteDescription: string;
  };
  logo: {
    logoUrl: string;
    faviconUrl: string;
    adminLogoUrl: string;
  };
  colors: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    linkColor: string;
  };
  fonts: {
    fontFamily: string;
    headingFontFamily: string;
    bodyFontFamily: string;
    fontSize: Record<string, string>;
  };
  menu: {
    items: MenuItem[];
  };
  instagram: {
    username: string;
    isEnabled: boolean;
  };
}

const GeneralSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<Array<{ _id: string; name: string; slug: string }>>([]);
  const [availablePages, setAvailablePages] = useState<Array<{ _id: string; title: string; slug: string }>>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    general: { websiteUrl: '', siteName: '', siteDescription: '' },
    logo: { logoUrl: '', faviconUrl: '', adminLogoUrl: '' },
    colors: {
      primaryColor: '#EF4444',
      secondaryColor: '#F59E0B',
      accentColor: '#10B981',
      backgroundColor: '#FFFFFF',
      textColor: '#111827',
      linkColor: '#3B82F6',
    },
    fonts: { fontFamily: 'Inter', headingFontFamily: '', bodyFontFamily: '', fontSize: {} },
    menu: { items: [] },
    instagram: { username: '', isEnabled: false },
  });

  useEffect(() => {
    fetchSettings();
    fetchLookups();
  }, []);

  const fetchLookups = async () => {
    setLoadingLookups(true);
    try {
      const [catResponse, pagesResponse] = await Promise.all([
        categoriesAPI.list().catch(() => ({ data: [] })),
        pagesAPI.getAll().catch(() => ({ data: { data: [] } })),
      ]);
      
      let categories: any[] = [];
      if (Array.isArray(catResponse)) {
        categories = catResponse;
      } else if (Array.isArray(catResponse?.data)) {
        categories = catResponse.data;
      } else if (Array.isArray(catResponse?.data?.data)) {
        categories = catResponse.data.data;
      }
      
      let pages: any[] = [];
      if (Array.isArray(pagesResponse)) {
        pages = pagesResponse;
      } else if (Array.isArray(pagesResponse?.data)) {
        pages = pagesResponse.data;
      } else if (Array.isArray(pagesResponse?.data?.data)) {
        pages = pagesResponse.data.data;
      }
      
      const sanitizedCategories = categories.map((cat: any) => ({
        ...cat,
        _id: typeof cat._id === 'string' ? cat._id : String(cat._id || ''),
        slug: cat.slug || '',
        name: cat.name || '',
      }));
      
      const sanitizedPages = pages.map((page: any) => ({
        ...page,
        _id: typeof page._id === 'string' ? page._id : String(page._id || ''),
        slug: page.slug || '',
        title: page.title || '',
      }));
      
      setAvailableCategories(sanitizedCategories);
      setAvailablePages(sanitizedPages);
    } catch (error) {
      console.error('Failed to fetch lookups:', error);
      setAvailableCategories([]);
      setAvailablePages([]);
    } finally {
      setLoadingLookups(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      const settings = response.data?.success && response.data?.data 
        ? response.data.data 
        : response.data?.data 
        ? response.data.data 
        : response.data;
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
          fonts: {
            fontFamily: settings.fonts?.fontFamily || 'Inter',
            headingFontFamily: settings.fonts?.headingFontFamily || '',
            bodyFontFamily: settings.fonts?.bodyFontFamily || '',
            fontSize: settings.fonts?.fontSize || {},
          },
          menu: {
            items: (settings.menu?.items || []) as MenuItem[],
          },
          instagram: {
            username: settings.instagram?.username || '',
            isEnabled: settings.instagram?.isEnabled || false,
          },
        });
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
      const settingsToSave = {
        general: formData.general,
        logo: formData.logo,
        colors: formData.colors,
        fonts: formData.fonts,
        menu: formData.menu,
        instagram: formData.instagram,
      };
      
      const response = await api.put('/settings', settingsToSave);
      if (response.data.success || response.data) {
        alert('Settings saved successfully!');
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

  const handleChange = (section: string, field: string, value: string | boolean | any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev],
        [field]: value,
      },
    }));
  };

  const handleMenuItemChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const newItems = [...(prev.menu?.items || [])];
      if (newItems[index]) {
        if (field === 'megaMenu') {
          newItems[index] = { ...newItems[index], megaMenu: value };
        } else {
          newItems[index] = { ...newItems[index], [field]: value };
        }
      }
      return { ...prev, menu: { ...prev.menu, items: newItems } };
    });
  };

  const addMenuItem = () => {
    setFormData(prev => {
      const currentItems = prev.menu?.items || [];
      return {
        ...prev,
        menu: {
          ...prev.menu,
          items: [
            ...currentItems,
            {
              label: '',
              type: 'link' as const,
              target: '',
              order: currentItems.length,
              isVisible: true,
              openInNewTab: false,
            },
          ],
        },
      };
    });
  };

  const removeMenuItem = (index: number) => {
    setFormData(prev => {
      const currentItems = [...(prev.menu?.items || [])];
      const filteredItems = currentItems.filter((_, i) => i !== index);
      return {
        ...prev,
        menu: {
          ...prev.menu,
          items: filteredItems.map((item, i) => ({ ...item, order: i })),
        },
      };
    });
  };

  const moveMenuItem = (index: number, direction: 'up' | 'down') => {
    setFormData(prev => {
      const items: MenuItem[] = [...(prev.menu.items || [])];
      if (direction === 'up' && index > 0) {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        items[index - 1] = { ...items[index - 1], order: index - 1 };
        items[index] = { ...items[index], order: index };
      } else if (direction === 'down' && index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
        items[index] = { ...items[index], order: index };
        items[index + 1] = { ...items[index + 1], order: index + 1 };
      }
      return { ...prev, menu: { items } };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
          className="text-muted-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">General Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">Configure website URL, logo, color scheme, typography, and menus</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        {/* General Settings */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Globe className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">General Information</h2>
                <p className="text-sm text-muted-foreground">Website URL and site information</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Website URL
                </label>
                <Input
                  type="text"
                  value={formData.general.websiteUrl}
                  onChange={(e) => handleChange('general', 'websiteUrl', e.target.value)}
                  placeholder="https://redfit.in"
                />
                <p className="text-[10px] text-muted-foreground">Your live website URL (e.g., https://redfit.in)</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Site Name
                </label>
                <Input
                  type="text"
                  value={formData.general.siteName}
                  onChange={(e) => handleChange('general', 'siteName', e.target.value)}
                  placeholder="Redfit"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Site Description
                </label>
                <Textarea
                  value={formData.general.siteDescription}
                  onChange={(e) => handleChange('general', 'siteDescription', e.target.value)}
                  placeholder="Premium apparel and fashion store"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logo Settings */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Logo & Icons</h2>
                <p className="text-sm text-muted-foreground">Configure logo URLs for website and admin panel</p>
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
          </CardContent>
        </Card>

        {/* Color Settings */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                <Palette className="w-6 h-6 text-pink-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Color Scheme</h2>
                <p className="text-sm text-muted-foreground">Configure brand colors for your website</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.colors.primaryColor}
                    onChange={(e) => handleChange('colors', 'primaryColor', e.target.value)}
                    className="w-16 h-10 border border-input rounded cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.colors.primaryColor}
                    onChange={(e) => handleChange('colors', 'primaryColor', e.target.value)}
                    placeholder="#EF4444"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Secondary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.colors.secondaryColor}
                    onChange={(e) => handleChange('colors', 'secondaryColor', e.target.value)}
                    className="w-16 h-10 border border-input rounded cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.colors.secondaryColor}
                    onChange={(e) => handleChange('colors', 'secondaryColor', e.target.value)}
                    placeholder="#F59E0B"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Accent Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.colors.accentColor}
                    onChange={(e) => handleChange('colors', 'accentColor', e.target.value)}
                    className="w-16 h-10 border border-input rounded cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.colors.accentColor}
                    onChange={(e) => handleChange('colors', 'accentColor', e.target.value)}
                    placeholder="#10B981"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Background Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.colors.backgroundColor}
                    onChange={(e) => handleChange('colors', 'backgroundColor', e.target.value)}
                    className="w-16 h-10 border border-input rounded cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.colors.backgroundColor}
                    onChange={(e) => handleChange('colors', 'backgroundColor', e.target.value)}
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Text Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.colors.textColor}
                    onChange={(e) => handleChange('colors', 'textColor', e.target.value)}
                    className="w-16 h-10 border border-input rounded cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.colors.textColor}
                    onChange={(e) => handleChange('colors', 'textColor', e.target.value)}
                    placeholder="#111827"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Link Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.colors.linkColor}
                    onChange={(e) => handleChange('colors', 'linkColor', e.target.value)}
                    className="w-16 h-10 border border-input rounded cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.colors.linkColor}
                    onChange={(e) => handleChange('colors', 'linkColor', e.target.value)}
                    placeholder="#3B82F6"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Font Settings */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <TypeIcon className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Font Configuration</h2>
                <p className="text-sm text-muted-foreground">Configure fonts for your website</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Primary Font Family
                </label>
                <Input
                  type="text"
                  value={formData.fonts.fontFamily}
                  onChange={(e) => handleChange('fonts', 'fontFamily', e.target.value)}
                  placeholder="Inter, sans-serif"
                />
                <p className="text-[10px] text-muted-foreground">Default font family for the entire site (e.g., Inter, Roboto, Poppins)</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Heading Font Family (Optional)
                </label>
                <Input
                  type="text"
                  value={formData.fonts.headingFontFamily}
                  onChange={(e) => handleChange('fonts', 'headingFontFamily', e.target.value)}
                  placeholder="Leave empty to use primary font"
                />
                <p className="text-[10px] text-muted-foreground">Font family for headings. Leave empty to use primary font.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Body Font Family (Optional)
                </label>
                <Input
                  type="text"
                  value={formData.fonts.bodyFontFamily}
                  onChange={(e) => handleChange('fonts', 'bodyFontFamily', e.target.value)}
                  placeholder="Leave empty to use primary font"
                />
                <p className="text-[10px] text-muted-foreground">Font family for body text. Leave empty to use primary font.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Menu Settings */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <MenuIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Menu Configuration</h2>
                <p className="text-sm text-muted-foreground">Configure navigation menu items</p>
              </div>
            </div>

            <div className="space-y-4">
              {formData.menu.items.map((item, index) => (
                <div key={index} className="border border-border rounded-lg p-4 space-y-3 bg-card">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-foreground">Menu Item #{index + 1}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => moveMenuItem(index, 'up')}
                        disabled={index === 0}
                        className="h-8 py-0 px-2"
                        title="Move up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => moveMenuItem(index, 'down')}
                        disabled={index === formData.menu.items.length - 1}
                        className="h-8 py-0 px-2"
                        title="Move down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => removeMenuItem(index)}
                        className="h-8 py-0 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">Label</label>
                      <Input
                        type="text"
                        value={item.label}
                        onChange={(e) => handleMenuItemChange(index, 'label', e.target.value)}
                        placeholder="Home"
                        className="text-sm h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">Type</label>
                      <select
                        value={item.type}
                        onChange={(e) => handleMenuItemChange(index, 'type', e.target.value)}
                        className="w-full h-9 px-3 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="link">Link (External)</option>
                        <option value="page">Page (Internal)</option>
                        <option value="category">Category</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Target {item.type === 'link' ? '(URL)' : item.type === 'category' ? '(Select Category)' : '(Select Page)'}
                      </label>
                      {item.type === 'category' ? (
                        <select
                          value={item.target || ''}
                          onChange={(e) => handleMenuItemChange(index, 'target', e.target.value)}
                          className="w-full h-9 px-3 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                          disabled={loadingLookups}
                        >
                          <option value="">Select Category</option>
                          {availableCategories.map((cat) => {
                            const catId = typeof cat._id === 'string' ? cat._id : String(cat._id || '');
                            const catSlug = cat.slug || cat.name || '';
                            return (
                              <option key={catId} value={catSlug}>
                                {cat.name} {cat.slug && `(${cat.slug})`}
                              </option>
                            );
                          })}
                        </select>
                      ) : item.type === 'page' ? (
                        <select
                          value={item.target || ''}
                          onChange={(e) => handleMenuItemChange(index, 'target', e.target.value)}
                          className="w-full h-9 px-3 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                          disabled={loadingLookups}
                        >
                          <option value="">Select Page</option>
                          {availablePages.map((page) => {
                            const pageId = typeof page._id === 'string' ? page._id : String(page._id || '');
                            const pageSlug = page.slug || page.title || '';
                            return (
                              <option key={pageId} value={pageSlug}>
                                {page.title} {page.slug && `(${page.slug})`}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <Input
                          type="text"
                          value={item.target || ''}
                          onChange={(e) => handleMenuItemChange(index, 'target', e.target.value)}
                          placeholder="https://example.com"
                          className="text-sm h-9"
                        />
                      )}
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <label className="block text-xs font-medium text-muted-foreground">Order</label>
                        <Input
                          type="number"
                          value={item.order}
                          onChange={(e) => handleMenuItemChange(index, 'order', parseInt(e.target.value) || 0)}
                          className="text-sm h-9"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pt-2 border-t">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={item.isVisible}
                        onCheckedChange={(checked) => handleMenuItemChange(index, 'isVisible', checked as boolean)}
                      />
                      <span className="text-sm font-medium leading-none">Visible</span>
                    </label>
                    {item.type === 'link' && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={item.openInNewTab || false}
                          onCheckedChange={(checked) => handleMenuItemChange(index, 'openInNewTab', checked as boolean)}
                        />
                        <span className="text-sm font-medium leading-none">Open in New Tab</span>
                      </label>
                    )}
                  </div>

                  {/* Mega Menu Configuration */}
                  <MegaMenuEditor
                    megaMenu={item.megaMenu}
                    onChange={(megaMenu) => handleMenuItemChange(index, 'megaMenu', megaMenu)}
                    menuItemIndex={index}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addMenuItem}
                className="w-full py-6 border-dashed border-2 hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Menu Item
              </Button>
              {formData.menu.items.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">No menu items configured. Add items above or use default menu.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Instagram Settings */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Instagram className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Instagram Feed</h2>
                <p className="text-sm text-muted-foreground">Configure Instagram account for dynamic feed</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.instagram.isEnabled}
                  onCheckedChange={(checked) => handleChange('instagram', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium leading-none">Enable Instagram Feed</span>
              </label>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Instagram Username
                </label>
                <Input
                  type="text"
                  value={formData.instagram.username}
                  onChange={(e) => handleChange('instagram', 'username', e.target.value)}
                  placeholder="thestreetwear_clothings"
                  disabled={!formData.instagram.isEnabled}
                />
                <p className="text-[10px] text-muted-foreground">
                  Enter Instagram username without @ (e.g., thestreetwear_clothings)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/settings')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default GeneralSettings;
