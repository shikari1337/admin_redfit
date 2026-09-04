import { useState, useEffect } from 'react';
import { marketingAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Mail, MessageSquare, Bell, Smartphone, Loader2 } from 'lucide-react';
import { getStatusColorClass as sharedStatusColorClass } from '@/components/order/StatusBadge';

interface Campaign {
  _id: string;
  name: string;
  channel: string;
  status: string;
  audienceSize?: number;
  sentCount?: number;
  openCount?: number;
  scheduledAt?: string;
  createdAt?: string;
}

interface AbandonedCart {
  _id: string;
  userId?: { name?: string; email?: string } | string;
  guestEmail?: string;
  items?: any[];
  total?: number;
  recoveryStatus?: string;
  updatedAt?: string;
}

const getChannelIcon = (channel: string) => {
  switch (channel.toLowerCase()) {
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'sms':
      return <Smartphone className="h-4 w-4" />;
    case 'whatsapp':
      return <MessageSquare className="h-4 w-4" />;
    case 'push':
      return <Bell className="h-4 w-4" />;
    default:
      return <Mail className="h-4 w-4" />;
  }
};

// Was a local reimplementation of the exact same palette already centralized
// in components/order/StatusBadge.tsx's 'marketing' domain (2026-09-04) —
// same colors, now one definition instead of two.
const getStatusColorClass = (status: string) => sharedStatusColorClass('marketing', status);

export default function Marketing() {
  const [activeTab, setActiveTab] = useState('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await marketingAPI.getCampaigns();
      setCampaigns(Array.isArray(data) ? data : data?.campaigns ?? data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const loadAbandonedCarts = async () => {
    try {
      setLoading(true);
      const data = await marketingAPI.getAbandonedCarts();
      setAbandonedCarts(Array.isArray(data) ? data : data?.carts ?? data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load abandoned carts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'campaigns') loadCampaigns();
    else loadAbandonedCarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleSendCampaign = async (id: string) => {
    if (!confirm('Send this campaign now?')) return;
    try {
      setSendingId(id);
      await marketingAPI.sendCampaign(id);
      setSuccess('Campaign sent successfully.');
      setTimeout(() => setSuccess(null), 3000);
      loadCampaigns();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to send campaign');
    } finally {
      setSendingId(null);
    }
  };

  const handleRecover = async (cartId: string, channel: 'whatsapp' | 'sms' | 'email') => {
    try {
      setRecoveringId(cartId);
      await marketingAPI.recoverAbandonedCart(cartId, channel);
      setSuccess(`Recovery message sent via ${channel}.`);
      setTimeout(() => setSuccess(null), 3000);
      loadAbandonedCarts();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to send recovery message');
    } finally {
      setRecoveringId(null);
    }
  };

  const getCustomerName = (cart: AbandonedCart): string => {
    if (typeof cart.userId === 'object' && cart.userId?.name) return cart.userId.name;
    if (cart.guestEmail) return cart.guestEmail;
    return 'Guest';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="text-sm text-muted-foreground mt-1">Campaigns, abandoned cart recovery and customer re-engagement.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 border border-red-200 rounded-lg text-sm font-medium flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg font-bold leading-none">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 p-4 border border-green-200 rounded-lg text-sm font-medium">
          {success}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted bg-opacity-50">
          <TabsTrigger value="campaigns" className="min-w-[120px]">
            Campaigns ({campaigns.length})
          </TabsTrigger>
          <TabsTrigger value="abandoned" className="min-w-[120px]">
            Abandoned Carts ({abandonedCarts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="m-0">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <p className="text-lg font-medium text-foreground">No campaigns created yet.</p>
                  <p className="text-sm mt-1">Create campaigns via the API or connect your marketing tools.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Audience</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Opens</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map(c => (
                        <TableRow key={c._id}>
                          <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 capitalize text-sm">
                              {getChannelIcon(c.channel)}
                              {c.channel}
                            </div>
                          </TableCell>
                          <TableCell>{c.audienceSize ?? '—'}</TableCell>
                          <TableCell>{c.sentCount ?? '—'}</TableCell>
                          <TableCell>{c.openCount ?? '—'}</TableCell>
                          <TableCell>
                            <Badge className={`capitalize ${getStatusColorClass(c.status)}`} variant="outline">
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {(c.status === 'draft' || c.status === 'scheduled') && (
                              <Button
                                size="sm"
                                disabled={sendingId === c._id}
                                onClick={() => handleSendCampaign(c._id)}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                {sendingId === c._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Send Now'
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abandoned" className="m-0">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : abandonedCarts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <p className="text-lg font-medium">No abandoned carts to recover.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Cart Value</TableHead>
                        <TableHead>Recovery Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Recover via</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {abandonedCarts.map(cart => (
                        <TableRow key={cart._id}>
                          <TableCell className="font-medium text-foreground">{getCustomerName(cart)}</TableCell>
                          <TableCell>{cart.items?.length ?? 0}</TableCell>
                          <TableCell className="font-medium">
                            {cart.total != null ? `₹${cart.total.toLocaleString()}` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge className={`capitalize ${getStatusColorClass(cart.recoveryStatus ?? 'draft')}`} variant="outline">
                              {cart.recoveryStatus ?? 'pending'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {cart.updatedAt ? new Date(cart.updatedAt).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {(['whatsapp', 'sms', 'email'] as const).map(ch => (
                                <Button
                                  key={ch}
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                  disabled={recoveringId === cart._id}
                                  onClick={() => handleRecover(cart._id, ch)}
                                  title={`Send recovery via ${ch}`}
                                >
                                  {recoveringId === cart._id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    getChannelIcon(ch)
                                  )}
                                </Button>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
