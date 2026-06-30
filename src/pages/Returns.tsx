import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FaEye, FaTimes } from 'react-icons/fa';

interface ReturnRequest {
  id: string;
  order_id: string;
  customer_name?: string;
  customer_email?: string;
  items?: any[];
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  refund_mode?: 'original_payment' | 'store_credit';
  refund_amount?: number;
  notes?: string;
  created_at?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved:  'bg-blue-100 text-blue-800 border-blue-200',
  rejected:  'bg-red-100 text-red-800 border-red-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
};

const TABS = ['all', 'pending', 'approved', 'rejected', 'completed'] as const;

const Returns: React.FC = () => {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selected, setSelected] = useState<ReturnRequest | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchReturns = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 50 };
      if (activeTab !== 'all') params.status = activeTab;
      const res = await api.get('/returns', { params });
      const data = res.data;
      if (Array.isArray(data)) {
        setReturns(data);
      } else if (Array.isArray(data?.data)) {
        setReturns(data.data);
      } else {
        setReturns([]);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setReturns([]);
      } else {
        setError(err?.response?.data?.message || 'Failed to load returns. The endpoint may not be available yet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, status: ReturnRequest['status']) => {
    setActionLoading(true);
    try {
      await api.put(`/returns/${id}`, { status, notes: actionNotes.trim() || undefined });
      setSelected(null);
      setActionNotes('');
      fetchReturns();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to update return request');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredReturns = returns; // already filtered by API

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Return Requests</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage customer return and refund requests.</p>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold px-4 py-3">Order ID</TableHead>
                <TableHead className="font-semibold px-4 py-3">Customer</TableHead>
                <TableHead className="font-semibold px-4 py-3">Items</TableHead>
                <TableHead className="font-semibold px-4 py-3">Reason</TableHead>
                <TableHead className="font-semibold px-4 py-3">Status</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Refund</TableHead>
                <TableHead className="font-semibold px-4 py-3">Date</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredReturns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                    No return requests found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredReturns.map(ret => (
                  <TableRow key={ret.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3 font-medium font-mono text-sm">
                      {ret.order_id}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="font-medium">{ret.customer_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{ret.customer_email || ''}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {ret.items?.length ?? '—'} item{(ret.items?.length ?? 0) !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground max-w-[160px] truncate" title={ret.reason}>
                      {ret.reason || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${STATUS_COLORS[ret.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {ret.status}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right text-sm font-medium">
                      {ret.refund_amount != null ? `₹${ret.refund_amount.toLocaleString('en-IN')}` : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {ret.created_at ? format(new Date(ret.created_at), 'MMM dd, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => { setSelected(ret); setActionNotes(ret.notes || ''); }}
                      >
                        <FaEye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Return Request Details</h2>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <FaTimes className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Order ID</span>
                  <p className="font-medium font-mono mt-0.5">{selected.order_id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="mt-0.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${STATUS_COLORS[selected.status]}`}>
                      {selected.status}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer</span>
                  <p className="font-medium mt-0.5">{selected.customer_name || '—'}</p>
                  <p className="text-muted-foreground text-xs">{selected.customer_email}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Refund Amount</span>
                  <p className="font-medium mt-0.5">
                    {selected.refund_amount != null ? `₹${selected.refund_amount.toLocaleString('en-IN')}` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Refund Mode</span>
                  <p className="font-medium mt-0.5 capitalize">
                    {selected.refund_mode?.replace(/_/g, ' ') || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p className="font-medium mt-0.5">
                    {selected.created_at ? format(new Date(selected.created_at), 'MMM dd, yyyy') : '—'}
                  </p>
                </div>
              </div>

              {selected.reason && (
                <div>
                  <span className="text-muted-foreground">Reason</span>
                  <p className="mt-1 p-3 bg-muted rounded-md">{selected.reason}</p>
                </div>
              )}

              {selected.items && selected.items.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Items</span>
                  <div className="mt-1 space-y-1">
                    {selected.items.map((item: any, i: number) => (
                      <div key={i} className="p-2 bg-muted rounded text-xs">
                        {typeof item === 'string' ? item : JSON.stringify(item)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Notes */}
              <div className="space-y-2">
                <Label htmlFor="action-notes">Admin Notes</Label>
                <Textarea
                  id="action-notes"
                  rows={3}
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  placeholder="Add notes for this action..."
                  className="resize-none"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 p-6 border-t bg-muted/30">
              {selected.status === 'pending' && (
                <>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={actionLoading}
                    onClick={() => handleAction(selected.id, 'approved')}
                  >
                    {actionLoading ? 'Updating...' : 'Approve'}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={actionLoading}
                    onClick={() => handleAction(selected.id, 'rejected')}
                  >
                    Reject
                  </Button>
                </>
              )}
              {selected.status === 'approved' && (
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={actionLoading}
                  onClick={() => handleAction(selected.id, 'completed')}
                >
                  {actionLoading ? 'Updating...' : 'Mark Complete'}
                </Button>
              )}
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Returns;
