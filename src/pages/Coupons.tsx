import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { couponsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { FaPlus, FaEdit, FaTrash, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { localeDate } from '../utils/date';
import { FilterChip, SearchBox, ListHeader } from '../components/sales/ListChrome';
import { ExportMenu, type CsvColumn } from '@/components/erp';
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
  isPublic?: boolean;
  is_public?: boolean;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableProducts?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** The coupon list as a file — the columns the page already holds. */
const COUPON_CSV_COLUMNS: CsvColumn<any>[] = [
  { key: 'code', label: 'Code' },
  { key: 'type', label: 'Type' },
  { key: 'value', label: 'Value' },
  { key: 'description', label: 'Description' },
  { key: 'minPurchase', label: 'Minimum purchase' },
  { key: 'maxDiscount', label: 'Maximum discount' },
  { key: 'usageCount', label: 'Times used' },
  { key: 'usageLimit', label: 'Usage limit' },
  { key: 'validFrom', label: 'Valid from' },
  { key: 'validUntil', label: 'Valid until' },
  { key: 'isActive', label: 'Switched on', format: (c: any) => (c.isActive ? 'Yes' : 'No') },
  { key: 'isPublic', label: 'Public', format: (c: any) => ((c.isPublic ?? c.is_public) ? 'Yes' : 'No') },
];

/** Where a coupon is in its life — the question the list is really asked. */
type CouponState = 'live' | 'scheduled' | 'expired' | 'off' | 'used_up';
function couponState(c: any): CouponState {
  if (!c.isActive) return 'off';
  const limit = Number(c.usageLimit ?? 0);
  if (limit > 0 && Number(c.usageCount ?? 0) >= limit) return 'used_up';
  const now = Date.now();
  const from = c.validFrom ? Date.parse(c.validFrom) : NaN;
  const until = c.validUntil ? Date.parse(c.validUntil) : NaN;
  if (Number.isFinite(from) && from > now) return 'scheduled';
  if (Number.isFinite(until) && until < now) return 'expired';
  return 'live';
}

const Coupons: React.FC = () => {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  // Backend requires marketing.manage for create/update (incl. active toggle),
  // marketing.delete for removal (routes/coupons.ts) — note this is marketing.*, not
  // coupons.* — this page had ZERO client-side gating before.
  const canManageCoupons = hasPerm('marketing.manage');
  const canDeleteCoupons = hasPerm('marketing.delete');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'' | CouponState>('');

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

  const term = search.trim().toLowerCase();
  const shown = coupons.filter((c) => {
    if (state && couponState(c) !== state) return false;
    if (!term) return true;
    return `${c.code ?? ''} ${c.description ?? ''}`.toLowerCase().includes(term);
  });
  /** One count per state, from the same function the chips filter by. */
  const counts = coupons.reduce((acc, c) => {
    const st = couponState(c); acc[st] = (acc[st] ?? 0) + 1; return acc;
  }, {} as Record<CouponState, number>);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-surface-2" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListHeader
        title="Coupons"
        purpose="Discount codes a shopper can type at checkout — what each one gives, who may use it, and until when."
        aside={<ExportMenu filename="coupons" columns={COUPON_CSV_COLUMNS} rows={shown} canExport />}
        action={canManageCoupons && (
          <Button onClick={() => navigate('/coupons/new')}>
            <FaPlus className="mr-2 h-4 w-4" /> New coupon
          </Button>
        )}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={search} onChange={setSearch}
            placeholder="Search by code or description" label="Search coupons" />
          <span className="text-sm tabular-nums text-ink-soft">
            {shown.length} of {coupons.length} coupon{coupons.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip on={!state} onClick={() => setState('')}>All</FilterChip>
          <FilterChip on={state === 'live'} tone="good" count={counts.live}
            onClick={() => setState(state === 'live' ? '' : 'live')}>Running now</FilterChip>
          <FilterChip on={state === 'scheduled'} count={counts.scheduled}
            onClick={() => setState(state === 'scheduled' ? '' : 'scheduled')}>Starts later</FilterChip>
          <FilterChip on={state === 'expired'} tone="warn" count={counts.expired}
            onClick={() => setState(state === 'expired' ? '' : 'expired')}>Finished</FilterChip>
          <FilterChip on={state === 'used_up'} tone="warn" count={counts.used_up}
            onClick={() => setState(state === 'used_up' ? '' : 'used_up')}>Fully used</FilterChip>
          <FilterChip on={state === 'off'} count={counts.off}
            onClick={() => setState(state === 'off' ? '' : 'off')}>Switched off</FilterChip>
          {(state || search) && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-ink-soft"
              onClick={() => { setState(''); setSearch(''); }}>Clear</Button>
          )}
        </div>
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
                {shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <p className="text-sm font-medium text-ink">
                        {coupons.length === 0 ? 'No coupons yet' : 'Nothing matches those filters'}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {coupons.length === 0
                          ? 'A coupon is a code a shopper types at checkout. Make the first one and it appears here.'
                          : 'Clear a chip above, or search by code.'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((coupon) => {
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
                            <span>{localeDate(coupon.validFrom)}</span>
                            {coupon.validUntil && (
                              <span className="text-xs">to {localeDate(coupon.validUntil)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            {canManageCoupons ? (
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
                            ) : (
                              <Badge
                                variant="outline"
                                className={`h-8 px-2 text-xs font-medium w-[90px] justify-start ${
                                  coupon.isActive
                                  ? 'text-green-700 bg-green-50'
                                  : 'text-slate-600 bg-slate-100'
                                }`}
                              >
                                {coupon.isActive ? <FaCheckCircle className="mr-1.5 h-3 w-3" /> : <FaTimesCircle className="mr-1.5 h-3 w-3" />}
                                {coupon.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            )}
                            <span className={`text-[10px] px-2 ${(coupon.isPublic ?? coupon.is_public ?? true) ? 'text-blue-600' : 'text-muted-foreground'}`}>
                              {(coupon.isPublic ?? coupon.is_public ?? true) ? 'Public' : 'Hidden'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canManageCoupons && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => navigate(`/coupons/${couponId}/edit`)}
                                title="Edit Coupon"
                              >
                                <FaEdit className="h-4 w-4" />
                              </Button>
                            )}
                            {canDeleteCoupons && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(couponId)}
                                title="Delete Coupon"
                              >
                                <FaTrash className="h-4 w-4" />
                              </Button>
                            )}
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

