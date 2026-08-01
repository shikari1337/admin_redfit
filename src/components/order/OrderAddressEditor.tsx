/**
 * Edit an order's shipping or billing address after it has been placed.
 *
 * The backend always allowed this (`PUT /orders/:id` writes the
 * `shipping_address` / `billing_address` jsonb columns through the column
 * whitelist) — there was simply no way to do it from the panel, so a customer
 * correcting their address after checkout meant editing the DB by hand.
 *
 * Field names are the STORED camelCase shape (`fullName`, `mobileNumber`,
 * `addressLine2`) — not the snake_case of the orders table. Renaming a key here
 * silently breaks the invoice, the packing slip and the courier booking, all of
 * which read these exact keys.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, AlertTriangle, Pencil } from 'lucide-react';
import { ordersAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type AddressKind = 'shipping' | 'billing';

/** Stored key → label. Order here is the order shown in the form. */
const FIELDS: Array<{ key: string; label: string; required?: boolean; wide?: boolean }> = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'mobileNumber', label: 'Mobile number', required: true },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address', required: true, wide: true },
  { key: 'addressLine2', label: 'Address line 2', wide: true },
  { key: 'landmark', label: 'Landmark' },
  { key: 'district', label: 'City / District', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'pincode', label: 'PIN code', required: true },
  { key: 'region', label: 'Region' },
];

/** Once the parcel is with the courier, editing the address changes nothing. */
const DISPATCHED = ['shipped', 'out_for_delivery', 'delivered', 'returned', 'completed'];

interface Props {
  orderId: string;
  orderStatus?: string;
  kind: AddressKind;
  address: Record<string, any> | null | undefined;
  onSaved: (next: Record<string, any>) => void;
}

export const OrderAddressEditor: React.FC<Props> = ({
  orderId, orderStatus, kind, address, onSaved,
}) => {
  const { hasPerm } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // Editing an order is a write — same permission the rest of the page uses.
  if (!hasPerm('orders.manage')) return null;

  const dispatched = DISPATCHED.includes(String(orderStatus ?? '').toLowerCase());

  const openEditor = () => {
    // Seed from the stored address, preserving any keys we don't render so a
    // save never drops data the checkout captured (lat/long, place ids…).
    const seed: Record<string, string> = {};
    for (const f of FIELDS) seed[f.key] = String(address?.[f.key] ?? '');
    setForm(seed);
    setOpen(true);
  };

  const save = async () => {
    const missing = FIELDS.filter((f) => f.required && !form[f.key]?.trim()).map((f) => f.label);
    if (missing.length) {
      toast({ variant: 'destructive', title: 'Missing details', description: missing.join(', ') });
      return;
    }
    setSaving(true);
    try {
      // Merge over the ORIGINAL object so unrendered keys survive.
      const next: Record<string, any> = { ...(address ?? {}) };
      for (const f of FIELDS) {
        const v = form[f.key]?.trim() ?? '';
        if (v) next[f.key] = v; else delete next[f.key];
      }
      const field = kind === 'shipping' ? 'shipping_address' : 'billing_address';
      await ordersAPI.update(orderId, { [field]: next });
      onSaved(next);
      toast({ title: 'Address updated', description: `${kind === 'shipping' ? 'Shipping' : 'Billing'} address saved.` });
      setOpen(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: e?.response?.data?.message ?? 'The address was not updated.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={openEditor}>
        <Pencil className="h-3 w-3" /> Edit
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit {kind === 'shipping' ? 'shipping' : 'billing'} address
            </DialogTitle>
            <DialogDescription>
              Changes apply to this order only — the customer’s saved address book is not touched.
            </DialogDescription>
          </DialogHeader>

          {dispatched && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This order is already <strong>{orderStatus}</strong>. The courier has the original
                address, so editing it here will not redirect the parcel — arrange that with the
                carrier. Update it only to correct your records or a re-ship.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? 'sm:col-span-2' : undefined}>
                <Label htmlFor={`addr-${f.key}`} className="text-xs">
                  {f.label}{f.required && <span className="text-red-600"> *</span>}
                </Label>
                <Input
                  id={`addr-${f.key}`}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OrderAddressEditor;
