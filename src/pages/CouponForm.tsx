import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { couponsAPI } from '../services/api';
import { FaArrowLeft, FaSave } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface CouponFormData {
  code: string;
  type: 'percentage' | 'fixed' | 'b2g1';
  value?: number;
  description: string;
  minPurchase?: number;
  maxDiscount?: number;
  usageLimit?: number;
  userLimit?: number;
  clubbedWithOtherCoupons: boolean;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableProducts?: string[];
}

const CouponForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CouponFormData>({
    code: '',
    type: 'percentage',
    value: 0,
    description: '',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    isActive: true,
    clubbedWithOtherCoupons: false,
  });

  useEffect(() => {
    if (isEdit && id) {
      fetchCoupon();
    }
  }, [id, isEdit]);

  const fetchCoupon = async () => {
    try {
      setLoading(true);
      const response = await couponsAPI.getById(id!);
      const coupon = response?.data || response;
      
      if (!coupon || typeof coupon !== 'object') {
        throw new Error('Invalid coupon data received');
      }
      
      const validFrom = coupon.validFrom ? new Date(coupon.validFrom).toISOString().split('T')[0] : '';
      const validUntil = coupon.validUntil ? new Date(coupon.validUntil).toISOString().split('T')[0] : '';

      setFormData({
        ...coupon,
        validFrom,
        validUntil: validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        applicableProducts: coupon.applicableProducts?.map((id: any) => id.toString()) || [],
        clubbedWithOtherCoupons: coupon.clubbedWithOtherCoupons ?? false,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch coupon');
      console.error('Error fetching coupon:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);

      const submitData = {
        ...formData,
        validFrom: new Date(formData.validFrom).toISOString(),
        validUntil: new Date(formData.validUntil).toISOString(),
      };

      if (isEdit) {
        await couponsAPI.update(id!, submitData);
      } else {
        await couponsAPI.create(submitData);
      }

      navigate('/coupons');
    } catch (err: any) {
      setError(err.message || `Failed to ${isEdit ? 'update' : 'create'} coupon`);
      console.error('Error saving coupon:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'value' || name === 'minPurchase' || name === 'maxDiscount' || name === 'usageLimit' || name === 'userLimit'
        ? (value ? parseFloat(value) : undefined)
        : value,
    }));
  };

  if (loading && isEdit) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground animate-pulse">Loading coupon...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/coupons')}
          className="text-muted-foreground hover:text-foreground"
        >
          <FaArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? 'Edit Coupon' : 'Create Coupon'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure discount rules and validity.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 border border-red-200 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Code */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Coupon Code *
                </label>
                <Input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  required
                  placeholder="e.g. SUMMER50"
                  className="uppercase"
                />
              </div>

              {/* Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Coupon Type *
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="percentage">Percentage Discount</option>
                  <option value="fixed">Fixed Amount Discount</option>
                  <option value="b2g1">Buy 2 Get 1 Free</option>
                </select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Description *
                </label>
                <Input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  placeholder="e.g. 50% off on summer collection"
                />
              </div>

              {/* Value (for percentage/fixed) */}
              {formData.type !== 'b2g1' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {formData.type === 'percentage' ? 'Percentage (%)' : 'Discount Amount (₹)'} *
                  </label>
                  <Input
                    type="number"
                    name="value"
                    value={formData.value || ''}
                    onChange={handleChange}
                    required={true}
                    min="0"
                    step={formData.type === 'percentage' ? '1' : '0.01'}
                    placeholder={formData.type === 'percentage' ? '50' : '500'}
                  />
                </div>
              )}

              {/* Min Purchase */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Minimum Purchase Amount (₹)
                </label>
                <Input
                  type="number"
                  name="minPurchase"
                  value={formData.minPurchase || ''}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                />
              </div>

              {/* Max Discount */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Maximum Discount Amount (₹)
                </label>
                <Input
                  type="number"
                  name="maxDiscount"
                  value={formData.maxDiscount || ''}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                />
              </div>

              {/* Usage Limit */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Usage Limit (Total)
                </label>
                <Input
                  type="number"
                  name="usageLimit"
                  value={formData.usageLimit || ''}
                  onChange={handleChange}
                  min="1"
                  placeholder="Leave empty for unlimited"
                />
                <p className="text-[10px] text-muted-foreground">Maximum total uses across all customers</p>
              </div>

              {/* User Limit */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Limit Per User
                </label>
                <Input
                  type="number"
                  name="userLimit"
                  value={formData.userLimit || ''}
                  onChange={handleChange}
                  min="1"
                  placeholder="Leave empty for unlimited"
                />
                <p className="text-[10px] text-muted-foreground">Maximum uses per individual customer</p>
              </div>

              {/* Valid From */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Valid From *
                </label>
                <Input
                  type="date"
                  name="validFrom"
                  value={formData.validFrom}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Valid Until */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Valid Until *
                </label>
                <Input
                  type="date"
                  name="validUntil"
                  value={formData.validUntil}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Is Active & Clubbed */}
              <div className="flex flex-col gap-4 mt-2 md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked as boolean }))}
                  />
                  <span className="text-sm font-medium leading-none">Active Strategy</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.clubbedWithOtherCoupons}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, clubbedWithOtherCoupons: checked as boolean }))}
                  />
                  <span className="text-sm font-medium leading-none">Can be clubbed with other coupons</span>
                </label>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/coupons')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
              >
                <FaSave className="mr-2 h-4 w-4" />
                {loading ? 'Saving...' : isEdit ? 'Update Coupon' : 'Create Coupon'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default CouponForm;

