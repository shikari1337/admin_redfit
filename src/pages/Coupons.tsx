import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { couponsAPI } from '../services/api';
import { FaPlus, FaEdit, FaTrash, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Coupon {
  _id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'b2g1';
  value?: number;
  description: string;
  minPurchase?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usageCount: number;
  userLimit?: number;
  clubbedWithOtherCoupons: boolean;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableProducts?: string[];
  createdAt?: string;
  updatedAt?: string;
}

const Coupons: React.FC = () => {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await couponsAPI.getAll();
      let couponsData: any[] = [];
      if (Array.isArray(response)) {
        couponsData = response;
      } else if (Array.isArray(response?.data)) {
        couponsData = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        couponsData = response.data.data;
      }
      const sanitizedCoupons = couponsData.map((coupon: any) => ({
        ...coupon,
        _id: typeof coupon._id === 'string' ? coupon._id : String(coupon._id || ''),
      }));
      setCoupons(sanitizedCoupons);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch coupons');
      console.error('Error fetching coupons:', err);
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string | any) => {
    if (!window.confirm('Are you sure you want to delete this coupon?')) {
      return;
    }

    try {
      const couponId = typeof id === 'string' ? id : String(id || '');
      await couponsAPI.delete(couponId);
      fetchCoupons();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to delete coupon');
      console.error('Error deleting coupon:', err);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const couponId = typeof coupon._id === 'string' ? coupon._id : String(coupon._id || '');
      await couponsAPI.update(couponId, {
        ...coupon,
        isActive: !coupon.isActive,
      });
      fetchCoupons();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to update coupon');
      console.error('Error updating coupon:', err);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'percentage':
        return 'Percentage';
      case 'fixed':
        return 'Fixed Amount';
      case 'b2g1':
        return 'Buy 2 Get 1 Free';
      default:
        return type;
    }
  };

  const getTypeValue = (coupon: Coupon) => {
    if (coupon.type === 'b2g1') {
      return 'Buy 2 Get 1 Free';
    } else if (coupon.type === 'percentage') {
      return `${coupon.value || 0}%`;
    } else if (coupon.type === 'fixed') {
      return `₹${coupon.value || 0}`;
    } else {
      return '-';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground animate-pulse">Loading coupons...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coupons</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage store discount codes and offers</p>
        </div>
        <Button onClick={() => navigate('/coupons/new')} className="bg-blue-600 hover:bg-blue-700 text-white">
          <FaPlus className="mr-2 h-4 w-4" /> Create Coupon
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 border border-red-200 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No coupons found. Create your first coupon!
                    </TableCell>
                  </TableRow>
                ) : (
                  coupons.map((coupon) => {
                    const couponId = typeof coupon._id === 'string' ? coupon._id : String(coupon._id || '');
                    return (
                      <TableRow key={couponId}>
                        <TableCell className="font-medium">
                          <Badge variant="outline" className="font-mono text-sm bg-slate-50">
                            {coupon.code}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{getTypeLabel(coupon.type)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-green-700">{getTypeValue(coupon)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {coupon.usageCount || 0} / {coupon.usageLimit || '∞'}
                            </span>
                            {coupon.userLimit && (
                              <span className="text-[10px] text-muted-foreground">Per user: {coupon.userLimit}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm text-muted-foreground">
                            <span>{new Date(coupon.validFrom).toLocaleDateString()}</span>
                            {coupon.validUntil && (
                              <span className="text-xs">to {new Date(coupon.validUntil).toLocaleDateString()}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 px-2 text-xs font-medium w-[90px] justify-start ${
                              coupon.isActive 
                              ? 'text-green-700 hover:text-green-800 hover:bg-green-100 bg-green-50' 
                              : 'text-slate-600 hover:text-slate-700 hover:bg-slate-200 bg-slate-100'
                            }`}
                            onClick={() => handleToggleActive(coupon)}
                          >
                            {coupon.isActive ? <FaCheckCircle className="mr-1.5 h-3 w-3" /> : <FaTimesCircle className="mr-1.5 h-3 w-3" />}
                            {coupon.isActive ? 'Active' : 'Inactive'}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => navigate(`/coupons/${couponId}/edit`)}
                              title="Edit Coupon"
                            >
                              <FaEdit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(couponId)}
                              title="Delete Coupon"
                            >
                              <FaTrash className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Coupons;

