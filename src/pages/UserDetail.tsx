/**
 * Customer detail: profile, the store's own tags and note, order history and saved addresses
 * for ONE customer.
 *
 * Everything here comes from a single `GET /customers/:id`, which already
 * returns the customer, their last 100 orders, their addresses, lifetime
 * totals, the store's tags and note, and where the store first met them (code
 * and label). `PATCH /customers/:id` changes only the store's tags and note.
 * `/users` is the STAFF table (staff.read/manage/delete), managed at Settings, Staff.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { customersAPI } from '../services/api';
import { fmtRupees } from '../lib/money';
import { useAuth } from '../contexts/AuthContext';
import {
  User,
  Mail,
  Phone,
  ShoppingCart,
  MapPin,
  ArrowLeft,
  Plus,
  StickyNote,
  Pencil,
  X,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStatusColorClass } from '../components/order/StatusBadge';
import { formatDate } from '../utils/date';
import InfoTip from '../components/common/InfoTip';
import { ListHeader } from '../components/sales/ListChrome';
import AppAnswersCard from '../components/app/AppAnswersCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** The server's limits (commerce customers.rs): 20 tags of 40 characters, a note of 2000. */
const MAX_TAGS = 20;
const MAX_TAG_CHARS = 40;
const MAX_NOTE_CHARS = 2000;

/**
 * The store's own tags and note on this customer: kept on the store's directory row, never on the
 * person's global record, and recorded on the customer's activity with who changed it. Tags are
 * what the Customers list filters by.
 */
const NotesCard: React.FC<{
  customerId: string;
  tags: string[];
  notes: string | null;
  canEdit: boolean;
  onSaved: (v: { tags: string[]; notes: string | null }) => void;
}> = ({ customerId, tags, notes, canEdit, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>(tags);
  const [draftNote, setDraftNote] = useState(notes ?? '');
  const [tagInput, setTagInput] = useState('');
  const [known, setKnown] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = () => {
    setDraftTags(tags); setDraftNote(notes ?? ''); setTagInput(''); setErr(null); setEditing(true);
    // The tags already in use at this store, so the same word is picked again rather than retyped.
    customersAPI.summary().then((s) => setKnown((s?.tags ?? []).map((t) => t.tag))).catch(() => {});
  };

  const addTag = (raw: string) => {
    const t = raw.split(/\s+/).filter(Boolean).join(' ');
    if (!t) return;
    if (t.length > MAX_TAG_CHARS) { setErr(`A tag is at most ${MAX_TAG_CHARS} characters.`); return; }
    if (draftTags.some((d) => d.toLowerCase() === t.toLowerCase())) { setTagInput(''); return; }
    if (draftTags.length >= MAX_TAGS) { setErr(`A customer carries at most ${MAX_TAGS} tags.`); return; }
    setErr(null);
    setDraftTags([...draftTags, t]);
    setTagInput('');
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const pending = tagInput.trim();
      const nextTags = pending && !draftTags.some((d) => d.toLowerCase() === pending.toLowerCase()) ? [...draftTags, pending] : draftTags;
      const saved = await customersAPI.updateNotes(customerId, { tags: nextTags, notes: draftNote });
      onSaved({ tags: Array.isArray(saved?.tags) ? saved.tags : nextTags, notes: saved?.notes ?? null });
      setEditing(false);
    } catch (e: any) {
      setErr(e?.response?.data?.error?.message || e?.response?.data?.message || 'The note could not be saved.');
    } finally { setSaving(false); }
  };

  const suggestions = known.filter((k) => !draftTags.some((d) => d.toLowerCase() === k.toLowerCase())
    && (!tagInput || k.toLowerCase().includes(tagInput.toLowerCase()))).slice(0, 8);

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <StickyNote className="h-4 w-4 text-ink-mute" /> Store notes
            <InfoTip text="Only your staff see these. They stay with this store and never change the customer's own account." />
          </div>
          {canEdit && !editing && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={open}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>

        {!editing ? (
          <>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Link key={t} to={`/customers?tag=${encodeURIComponent(t)}`}
                    className="rounded border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-soft hover:border-line-strong">{t}</Link>
                ))}
              </div>
            ) : null}
            {notes ? (
              <p className="whitespace-pre-wrap text-sm text-ink">{notes}</p>
            ) : (
              tags.length === 0 && (
                <p className="text-xs text-ink-mute">
                  {canEdit ? 'No tags or note yet. Add what the team should know, like a preferred delivery time or a regular order.' : 'No tags or note yet.'}
                </p>
              )
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-ink-soft">Tags</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {draftTags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => setDraftTags(draftTags.filter((d) => d !== t))}
                      className="text-ink-mute hover:text-ink"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} maxLength={MAX_TAG_CHARS}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                    else if (e.key === 'Backspace' && !tagInput && draftTags.length) setDraftTags(draftTags.slice(0, -1));
                  }}
                  placeholder="Add a tag, then Enter" className="h-8 w-full min-w-[10rem] flex-1 text-sm sm:w-auto" />
              </div>
              {suggestions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => addTag(s)}
                      className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-ink-soft hover:border-line-strong">+ {s}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-soft">
                <span>Note</span>
                <span className="tabular-nums">{draftNote.length}/{MAX_NOTE_CHARS}</span>
              </div>
              <Textarea value={draftNote} onChange={(e) => setDraftNote(e.target.value.slice(0, MAX_NOTE_CHARS))} rows={4}
                placeholder="What the team should know about this customer" />
            </div>
            {err && <p className="text-xs text-bad-ink">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { hasPerm } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('orders');

  useEffect(() => {
    if (id) fetchCustomer();
  }, [id]);

  // ONE request: /customers/:id returns profile + orders + addresses + totals.
  const fetchCustomer = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customersAPI.getById(id!);
      const c = data?.data ?? data;
      setUser(c);
      setOrders(Array.isArray(c?.orders) ? c.orders : []);
      setAddresses(Array.isArray(c?.addresses) ? c.addresses : []);
      setTotalSpent(Number(c?.total_spent ?? c?.totalSpent ?? 0));
    } catch (e: any) {
      setError(e?.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  // Order status colours come from the same 'order' palette components/order/StatusBadge.tsx
  // centralizes elsewhere.

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground mb-4">{error || 'Customer not found'}</p>
        <Button variant="outline" asChild>
          <Link to="/customers">Back to Customers</Link>
        </Button>
      </div>
    );
  }

  const b2b = user.b2b ?? {};
  // Where the store first met them: the code and the sales-channel vocabulary's own label, from the server.
  const originCode: string | null = user.acquisition_channel ?? b2b.acquisition_channel ?? null;
  const originLabel: string | null = user.acquisition_channel_label ?? originCode;
  const avgOrder = orders.length ? totalSpent / orders.length : 0;
  const capped = orders.length >= 100;
  const lastOrder = orders[0]?.created_at ?? null;
  const canManage = hasPerm('customers.manage');
  const tags: string[] = Array.isArray(user.tags) ? user.tags : [];
  const notes: string | null = typeof user.notes === 'string' && user.notes ? user.notes : null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="-ml-3 h-7 w-fit text-ink-soft" asChild>
        <Link to="/customers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Customers</Link>
      </Button>
      <ListHeader
        title={user.displayName || user.name || 'Unnamed customer'}
        purpose="Who they are, what they have bought, where they ship to and the wholesale terms they buy on."
        action={
          <Button size="sm" asChild>
            <Link to={`/orders/new?customer=${encodeURIComponent(String(id))}`}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New order for them
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Identity */}
        <Card className="lg:col-span-1">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2">
                <User className="h-5 w-5 text-ink-soft" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  {b2b.is_b2b
                    ? <Badge variant="outline" className="border-info bg-info-bg text-info-ink">Wholesale{b2b.b2b_tier ? `, ${b2b.b2b_tier}` : ''}</Badge>
                    : <Badge variant="outline" className="border-line text-ink-soft">Retail</Badge>}
                  {originLabel && (
                    <Badge variant="outline" className="border-line text-ink-soft" title="Where the store first met this customer">
                      From {originLabel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <dl className="space-y-1.5 text-sm">
              {user.email && <div className="flex items-center gap-2 text-ink"><Mail className="h-3.5 w-3.5 text-ink-mute" />{user.email}</div>}
              {user.phone && <div className="flex items-center gap-2 tabular-nums text-ink"><Phone className="h-3.5 w-3.5 text-ink-mute" />{user.dial_code ? `${user.dial_code} ` : ''}{user.phone}</div>}
              {user.gstin && <div className="font-mono text-xs text-ink-soft">GSTIN {user.gstin}</div>}
              {!user.email && !user.phone && <div className="text-xs text-ink-mute">No contact recorded</div>}
            </dl>
          </CardContent>
        </Card>

        {/* Numbers */}
        <Card className="lg:col-span-2">
          <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {[
              { label: 'Orders', value: capped ? '100+' : String(orders.length), tip: capped ? 'This page reads the latest 100 orders, so the true count is at least 100.' : undefined },
              { label: 'Lifetime value', value: fmtRupees(totalSpent), tip: 'The total of the orders listed below, as each order recorded it.' },
              { label: 'Average order', value: orders.length ? fmtRupees(avgOrder) : 'None yet' },
              { label: 'Last order', value: lastOrder ? formatDate(lastOrder, 'dd MMM yyyy') : 'None yet' },
            ].map((k) => (
              <div key={k.label}>
                <div className="flex items-center gap-1 text-xs text-ink-soft">{k.label}{k.tip && <InfoTip text={k.tip} />}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{k.value}</div>
              </div>
            ))}
            {b2b.is_b2b && (
              <div className="col-span-2 rounded-md border border-line bg-surface-2 p-3 text-sm sm:col-span-4">
                <div className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-soft">
                  Wholesale terms <InfoTip text="Set on the Wholesale (B2B) page, under Customers. Prices on a new order follow this tier or pinned price list." />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums text-ink">
                  {b2b.company_name && <span>{b2b.company_name}</span>}
                  <span>Tier: {b2b.b2b_tier || 'store default'}</span>
                  {Number(b2b.credit_limit) > 0 && <span>Credit {fmtRupees(Number(b2b.credit_limit))}, {b2b.credit_days ?? 0} days</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* The store's own tags and note: what the team should know before talking to them. */}
      {!user.person_erased_at && (
        <NotesCard
          customerId={String(id)}
          tags={tags}
          notes={notes}
          canEdit={canManage}
          onSaved={(v) => setUser((u: any) => ({ ...u, tags: v.tags, notes: v.notes }))}
        />
      )}

      {/* The customer's own answers in the store's app (HMAPP-3 point 4), kept only with their consent. */}
      {id && !user.person_erased_at && <AppAnswersCard customerId={id} />}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="orders" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="addresses" className="gap-2">
            <MapPin className="h-4 w-4" />
            Saved Addresses ({addresses.length})
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-6">
            <TabsContent value="orders" className="m-0 border-0 p-0">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ShoppingCart className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-sm font-medium text-ink">No orders yet</p>
                  <p className="mt-1 text-xs text-ink-soft">Use "New order for them" above to key one in.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap font-medium tabular-nums">{order.order_id}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtRupees(order.total || 0)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize border-transparent ${getStatusColorClass('order', order.order_status)}`}>
                            {order.order_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {order.created_at ? formatDate(order.created_at, 'MMM dd, yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/orders/${order.id}`} className="text-primary hover:text-primary/80">
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="addresses" className="m-0 border-0 p-0">
              {addresses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MapPin className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No saved addresses found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map((address) => (
                    <Card key={address.id} className={address.is_default ? 'border-primary bg-primary/5' : ''}>
                      <CardContent className="p-4">
                        {address.is_default && (
                          <Badge className="mb-2">Default</Badge>
                        )}
                        <div className="font-semibold mb-2">{address.full_name}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>{address.line1}</p>
                          {address.line2 && <p>{address.line2}</p>}
                          {address.landmark && <p>{address.landmark}</p>}
                          <p>
                            {address.district && `${address.district}, `}
                            {address.state} - {address.pincode}
                          </p>
                          {address.mobile && (
                            <p className="pt-2">
                              <span className="font-medium text-foreground">Phone:</span> {address.mobile}
                            </p>
                          )}
                          {address.email && (
                            <p>
                              <span className="font-medium text-foreground">Email:</span> {address.email}
                            </p>
                          )}
                          {address.label && (
                            <Badge variant="secondary" className="mt-2">{address.label}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default UserDetail;


