import React, { useState, useEffect } from 'react';
import { b2bAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Edit, Search, Plus, Building2, FileText, Tags, Settings } from 'lucide-react';
import B2BPriceLists from '../components/b2b/B2BPriceLists';
import B2BSettings from '../components/b2b/B2BSettings';

type Tab = 'accounts' | 'quotes' | 'price-lists' | 'settings';

interface B2BAccount {
  _id: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  creditLimit?: number;
  netPaymentDays?: number;
  discountPercent?: number;
  isActive?: boolean;
}

interface B2BQuote {
  _id: string;
  quoteNumber?: string;
  accountId?: { companyName?: string } | string;
  status: string;
  totalAmount?: number;
  items?: any[];
  createdAt?: string;
}

export default function B2B() {
  const [activeTab, setActiveTab] = useState<Tab>('accounts');
  const [accounts, setAccounts] = useState<B2BAccount[]>([]);
  const [quotes, setQuotes] = useState<B2BQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Account form
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editAccount, setEditAccount] = useState<B2BAccount | null>(null);
  const [accountForm, setAccountForm] = useState({
    companyName: '', contactName: '', email: '', phone: '',
    creditLimit: '', netPaymentDays: '30', discountPercent: '0',
  });
  const [savingAccount, setSavingAccount] = useState(false);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await b2bAPI.getAccounts({ search: search || undefined });
      setAccounts(Array.isArray(data) ? data : data?.accounts ?? data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load B2B accounts');
    } finally {
      setLoading(false);
    }
  };

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const data = await b2bAPI.getQuotes();
      setQuotes(Array.isArray(data) ? data : data?.quotes ?? data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load B2B quotes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'accounts') loadAccounts();
    else loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const openCreateAccount = () => {
    setEditAccount(null);
    setAccountForm({ companyName: '', contactName: '', email: '', phone: '', creditLimit: '', netPaymentDays: '30', discountPercent: '0' });
    setShowAccountForm(true);
  };

  const openEditAccount = (acc: B2BAccount) => {
    setEditAccount(acc);
    setAccountForm({
      companyName: acc.companyName,
      contactName: acc.contactName ?? '',
      email: acc.email ?? '',
      phone: acc.phone ?? '',
      creditLimit: acc.creditLimit != null ? String(acc.creditLimit) : '',
      netPaymentDays: acc.netPaymentDays != null ? String(acc.netPaymentDays) : '30',
      discountPercent: acc.discountPercent != null ? String(acc.discountPercent) : '0',
    });
    setShowAccountForm(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.companyName.trim()) { setError('Company name is required.'); return; }
    try {
      setSavingAccount(true);
      setError(null);
      const payload = {
        companyName: accountForm.companyName.trim(),
        ...(accountForm.contactName && { contactName: accountForm.contactName.trim() }),
        ...(accountForm.email && { email: accountForm.email.trim() }),
        ...(accountForm.phone && { phone: accountForm.phone.trim() }),
        ...(accountForm.creditLimit && { creditLimit: Number(accountForm.creditLimit) }),
        netPaymentDays: Number(accountForm.netPaymentDays) || 30,
        discountPercent: Number(accountForm.discountPercent) || 0,
      };
      if (editAccount) {
        await b2bAPI.updateAccount(editAccount._id, payload);
        setSuccess('Account updated.');
      } else {
        await b2bAPI.createAccount(payload);
        setSuccess('Account created.');
      }
      setShowAccountForm(false);
      setTimeout(() => setSuccess(null), 3000);
      loadAccounts();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to save account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleConvertQuote = async (quoteId: string) => {
    if (!confirm('Convert this quote to an order?')) return;
    try {
      await b2bAPI.convertQuoteToOrder(quoteId);
      setSuccess('Quote converted to order.');
      setTimeout(() => setSuccess(null), 3000);
      loadQuotes();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to convert quote');
    }
  };

  const filteredAccounts = accounts.filter(a =>
    !search || a.companyName.toLowerCase().includes(search.toLowerCase()) || (a.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft': return 'secondary';
      case 'sent': return 'default';
      case 'accepted': return 'success';
      case 'rejected': return 'destructive';
      case 'converted': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">B2B Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage wholesale accounts and quotations.</p>
        </div>
        {activeTab === 'accounts' && (
          <Button onClick={openCreateAccount}>
            <Plus className="mr-2 h-4 w-4" />
            New Account
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive border border-destructive/20 p-4 rounded-md flex justify-between items-center text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-70">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 border border-green-200 p-4 rounded-md text-sm">
          <span>{success}</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as Tab)} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="accounts" className="gap-2">
            <Building2 className="h-4 w-4" />
            Accounts ({accounts.length})
          </TabsTrigger>
          <TabsTrigger value="price-lists" className="gap-2">
            <Tags className="h-4 w-4" />
            Price Lists
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-2">
            <FileText className="h-4 w-4" />
            Quotes ({quotes.length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-6">
            <TabsContent value="accounts" className="m-0 border-0 p-0">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by company or email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && loadAccounts()}
                    className="pl-8"
                  />
                </div>
                <Button variant="secondary" onClick={loadAccounts}>Search</Button>
              </div>

              {loading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No B2B accounts found.</p>
                  <Button onClick={openCreateAccount}>Add first account</Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Credit Limit</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Net Days</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAccounts.map(acc => (
                        <TableRow key={acc._id}>
                          <TableCell className="font-medium">{acc.companyName}</TableCell>
                          <TableCell>{acc.contactName ?? '—'}</TableCell>
                          <TableCell>{acc.email ?? '—'}</TableCell>
                          <TableCell>{acc.creditLimit != null ? `₹${acc.creditLimit.toLocaleString()}` : '—'}</TableCell>
                          <TableCell>{acc.discountPercent != null ? `${acc.discountPercent}%` : '—'}</TableCell>
                          <TableCell>{acc.netPaymentDays ?? 30} days</TableCell>
                          <TableCell>
                            <Badge variant={(acc.isActive !== false ? 'success' : 'secondary') as any}>
                              {acc.isActive !== false ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEditAccount(acc)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="quotes" className="m-0 border-0 p-0">
              {loading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : quotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No B2B quotes found.</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote #</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map(q => (
                        <TableRow key={q._id}>
                          <TableCell className="font-medium">{q.quoteNumber ?? q._id.slice(-8)}</TableCell>
                          <TableCell>{typeof q.accountId === 'object' ? q.accountId?.companyName : '—'}</TableCell>
                          <TableCell>{q.items?.length ?? 0}</TableCell>
                          <TableCell>{q.totalAmount != null ? `₹${q.totalAmount.toLocaleString()}` : '—'}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(q.status) as any} className="capitalize">
                              {q.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {(q.status === 'accepted' || q.status === 'draft') && (
                              <Button variant="secondary" size="sm" onClick={() => handleConvertQuote(q._id)}>
                                Convert to Order
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="price-lists" className="m-0 border-0 p-0">
              <B2BPriceLists />
            </TabsContent>

            <TabsContent value="settings" className="m-0 border-0 p-0 pt-4">
              <B2BSettings />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      <Dialog open={showAccountForm} onOpenChange={setShowAccountForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editAccount ? 'Edit Account' : 'New B2B Account'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveAccount} className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Company Name *</Label>
                <Input value={accountForm.companyName} onChange={e => setAccountForm(f => ({ ...f, companyName: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input value={accountForm.contactName} onChange={e => setAccountForm(f => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={accountForm.email} onChange={e => setAccountForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={accountForm.phone} onChange={e => setAccountForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Credit Limit (₹)</Label>
                <Input type="number" min="0" value={accountForm.creditLimit} onChange={e => setAccountForm(f => ({ ...f, creditLimit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Net Payment Days</Label>
                <Input type="number" min="0" value={accountForm.netPaymentDays} onChange={e => setAccountForm(f => ({ ...f, netPaymentDays: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Discount (%)</Label>
                <Input type="number" min="0" max="100" value={accountForm.discountPercent} onChange={e => setAccountForm(f => ({ ...f, discountPercent: e.target.value }))} />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setShowAccountForm(false)}>Cancel</Button>
              <Button type="submit" disabled={savingAccount}>
                {savingAccount ? 'Saving...' : editAccount ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
