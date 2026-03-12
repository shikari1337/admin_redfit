import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Percent, Plus, Trash2, Edit, Check, X, Warehouse, Loader2 } from 'lucide-react';
import { gstSettingsAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

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
      const response = await gstSettingsAPI.get();
      const settings = response?.data || response;
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">GST Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">Configure GST tax brackets. Warehouses act as GST stores - manage them in the Warehouses section.</p>
      </div>

      <div className="space-y-6 pb-12">
        {/* Show Price Including GST */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Show Price Including GST</h2>
                <p className="text-sm text-muted-foreground">Display product prices with GST included on the frontend</p>
              </div>
              <label className="flex items-center cursor-pointer">
                <Checkbox
                  checked={showPriceIncludingGst}
                  onCheckedChange={(checked) => setShowPriceIncludingGst(checked as boolean)}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Show GST on Checkout */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Show GST on Checkout</h2>
                <p className="text-sm text-muted-foreground">Display GST calculation breakdown on checkout page</p>
              </div>
              <label className="flex items-center cursor-pointer">
                <Checkbox
                  checked={showGstOnCheckout}
                  onCheckedChange={(checked) => setShowGstOnCheckout(checked as boolean)}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Tax Brackets */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Percent className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <CardTitle>Tax Brackets</CardTitle>
              <CardDescription>Configure GST tax rates (e.g., 5%, 12%, 18%, 28%)</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing Brackets */}
            {taxBrackets.map((bracket) => (
              <div key={bracket._id} className="flex items-center gap-4 p-4 border rounded-lg bg-card">
                {editingBracket === bracket._id ? (
                  <>
                    <Input
                      type="text"
                      value={bracket.name}
                      onChange={(e) => setTaxBrackets(taxBrackets.map(b => 
                        b._id === bracket._id ? { ...b, name: e.target.value } : b
                      ))}
                      placeholder="Bracket Name (e.g., 18% GST)"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={bracket.rate}
                      onChange={(e) => setTaxBrackets(taxBrackets.map(b => 
                        b._id === bracket._id ? { ...b, rate: parseFloat(e.target.value) || 0 } : b
                      ))}
                      placeholder="Rate %"
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-32"
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={bracket.isActive}
                        onCheckedChange={(checked) => setTaxBrackets(taxBrackets.map(b => 
                          b._id === bracket._id ? { ...b, isActive: checked as boolean } : b
                        ))}
                      />
                      <span className="text-sm font-medium">Active</span>
                    </label>
                    <div className="flex gap-1 ml-auto">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUpdateBracket(bracket._id!)}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingBracket(null)}
                        className="text-muted-foreground"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{bracket.name}</div>
                      <div className="text-sm text-muted-foreground">{bracket.rate}%</div>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      bracket.isActive ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
                    }`}>
                      {bracket.isActive ? 'Active' : 'Inactive'}
                    </div>
                    <div className="flex gap-1 ml-auto">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingBracket(bracket._id!)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteBracket(bracket._id!)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Add New Bracket */}
            <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg bg-card">
              <Input
                type="text"
                value={newBracket.name}
                onChange={(e) => setNewBracket({ ...newBracket, name: e.target.value })}
                placeholder="Bracket Name (e.g., 18% GST)"
                className="flex-1"
              />
              <Input
                type="number"
                value={newBracket.rate}
                onChange={(e) => setNewBracket({ ...newBracket, rate: parseFloat(e.target.value) || 0 })}
                placeholder="Rate %"
                min="0"
                max="100"
                step="0.01"
                className="w-32"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={newBracket.isActive}
                  onCheckedChange={(checked) => setNewBracket({ ...newBracket, isActive: checked as boolean })}
                />
                <span className="text-sm font-medium">Active</span>
              </label>
              <Button
                type="button"
                onClick={handleAddBracket}
                className="ml-auto"
              >
                <Plus className="w-4 h-4 mr-2" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Warehouses Info */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Warehouse className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <CardTitle>GST Stores (Warehouses)</CardTitle>
              <CardDescription>Warehouses act as GST stores. Manage warehouses in the <strong>Warehouses</strong> section.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> GST calculation now uses warehouses instead of separate stores. Each warehouse can have a GSTIN configured. 
                Go to <strong>Settings → Warehouses</strong> to manage warehouse locations and configure GSTIN for each warehouse.
              </p>
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
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GstSettings;
