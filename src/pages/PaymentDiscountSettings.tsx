import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CreditCard, Plus, Trash2, Percent, Loader2 } from 'lucide-react';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface QuantityDiscount {
  minQuantity: number;
  discountPercent: number;
}

const PaymentDiscountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    razorpayDiscountPercent: 2,
    quantityDiscounts: [] as QuantityDiscount[],
    excludeBundledProductsFromQuantityDiscount: false,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      const settings = response.data?.success && response.data?.data 
        ? response.data.data 
        : response.data?.data 
        ? response.data.data 
        : response.data;
      
      if (settings) {
        setFormData({
          razorpayDiscountPercent: settings.razorpayDiscountPercent || 2,
          quantityDiscounts: settings.quantityDiscounts || [
            { minQuantity: 5, discountPercent: 5 },
            { minQuantity: 10, discountPercent: 10 },
            { minQuantity: 20, discountPercent: 15 },
          ],
          excludeBundledProductsFromQuantityDiscount: settings.excludeBundledProductsFromQuantityDiscount || false,
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      setFormData({
        razorpayDiscountPercent: 2,
        quantityDiscounts: [
          { minQuantity: 5, discountPercent: 5 },
          { minQuantity: 10, discountPercent: 10 },
          { minQuantity: 20, discountPercent: 15 },
        ],
        excludeBundledProductsFromQuantityDiscount: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', formData);
      alert('Payment gateway discount settings saved successfully!');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Payment Gateway Discount</h1>
        <p className="text-sm text-muted-foreground mt-2">Configure discount percentage for prepaid orders</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <CardTitle>Razorpay Discount</CardTitle>
              <CardDescription>Percentage discount applied to prepaid orders</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Discount Percentage <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.razorpayDiscountPercent}
                  onChange={(e) => handleChange('razorpayDiscountPercent', e.target.value)}
                  placeholder="2"
                  className="w-32"
                />
                <span className="text-foreground font-medium">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                This discount will be applied to prepaid orders (Razorpay payments). 
                The discount is calculated on the subtotal after quantity discounts.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This setting controls the discount percentage shown in the checkout page. 
                Make sure the backend also uses the same percentage for consistency.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quantity Discounts Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-t pt-6 mt-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Percent className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Quantity Discounts</CardTitle>
                <CardDescription>Configure automatic discounts based on total quantity</CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  ...formData,
                  quantityDiscounts: [
                    ...formData.quantityDiscounts,
                    { minQuantity: 1, discountPercent: 0 },
                  ],
                });
              }}
              className="text-green-600 border-green-200 hover:bg-green-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Tier
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {formData.quantityDiscounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No quantity discounts configured. Click "Add Tier" to add one.</p>
            ) : (
              <div className="space-y-4">
                {formData.quantityDiscounts.map((discount, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Minimum Quantity
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={discount.minQuantity}
                          onChange={(e) => {
                            const newDiscounts = [...formData.quantityDiscounts];
                            newDiscounts[index].minQuantity = parseInt(e.target.value) || 1;
                            setFormData({ ...formData, quantityDiscounts: newDiscounts });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Discount Percentage
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={discount.discountPercent}
                            onChange={(e) => {
                              const newDiscounts = [...formData.quantityDiscounts];
                              newDiscounts[index].discountPercent = parseFloat(e.target.value) || 0;
                              setFormData({ ...formData, quantityDiscounts: newDiscounts });
                            }}
                          />
                          <span className="text-foreground font-medium">%</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newDiscounts = formData.quantityDiscounts.filter((_, i) => i !== index);
                        setFormData({ ...formData, quantityDiscounts: newDiscounts });
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.excludeBundledProductsFromQuantityDiscount}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, excludeBundledProductsFromQuantityDiscount: checked as boolean }))}
                />
                <span className="text-sm font-medium">Exclude bundled products from quantity discounts</span>
              </label>
              <p className="text-[10px] text-muted-foreground pl-6">
                When enabled, products purchased with quantity-based bundles will not count toward quantity discount thresholds. 
                This prevents double discounting since bundled products are already discounted.
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Discounts are applied based on total quantity in cart. 
                Higher quantity thresholds should have higher discount percentages. 
                The system will apply the highest applicable discount.
                {formData.excludeBundledProductsFromQuantityDiscount && (
                  <span className="block mt-1">
                    <strong>Bundled products excluded:</strong> Only non-bundled items will count toward quantity discount thresholds.
                  </span>
                )}
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

export default PaymentDiscountSettings;
