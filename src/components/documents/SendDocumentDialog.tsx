import React, { useEffect, useState } from 'react';
import { Loader2, Mail, MessageCircle, MessageSquare, Send } from 'lucide-react';
import { documentsAPI } from '@/services/api';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import InfoTip from '@/components/common/InfoTip';
import { Btn, Field, TextInput, Chip } from '@/components/erp';

/**
 * SEND A DOCUMENT — the question a person should see answered BEFORE the send.
 *
 * There is no sender here. Each ticked channel is one `POST /documents/:id/send`,
 * which renders the PDF and hands it to `comms.notify()` — consent, quiet hours,
 * the template registry and the dispatch record all live there. What this dialog
 * adds is the asking: the address on the document (editable, per channel), whether
 * a template exists for WhatsApp/SMS, whether consent is held by the PERSON or by
 * the store, and afterwards the hub's OWN words for each channel — "no approved
 * template", "opted out" — never a bare "failed". A dispatch id comes back per
 * channel and the document's detail page lists them.
 */

type Ch = 'email' | 'whatsapp' | 'sms';

const CH: Array<{ key: Ch; label: string; icon: React.ComponentType<{ className?: string }>; addr: 'email' | 'phone' }> = [
  { key: 'email', label: 'Email (PDF attached)', icon: Mail, addr: 'email' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, addr: 'phone' },
  { key: 'sms', label: 'SMS', icon: MessageSquare, addr: 'phone' },
];

interface Outcome { channel: Ch; ok: boolean; status?: string; detail?: string; dispatch_id?: string | null }

const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Could not send';

const SendDocumentDialog: React.FC<{
  open: boolean;
  documentId: string;
  label: string;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}> = ({ open, documentId, label, onOpenChange, onSent }) => {
  const [opts, setOpts] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [picked, setPicked] = useState<Record<Ch, boolean>>({ email: true, whatsapp: false, sms: false });
  const [to, setTo] = useState<{ email: string; phone: string }>({ email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Outcome[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); setLoadErr(''); setResults([]);
    documentsAPI.sendOptions(documentId)
      .then((d: any) => {
        if (!alive) return;
        setOpts(d);
        setTo({ email: d?.to?.email ?? '', phone: d?.to?.phone ?? '' });
        // Tick what can actually go: email when there is an address, never a
        // channel with no address on the document.
        setPicked({ email: !!d?.to?.email, whatsapp: false, sms: false });
      })
      .catch((e) => { if (alive) setLoadErr(errText(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, documentId]);

  const channelNote = (c: Ch): { tone: 'green' | 'amber' | 'red' | 'neutral'; text: string } | null => {
    if (!opts) return null;
    if (c === 'email') return { tone: 'neutral', text: 'The PDF goes as an attachment.' };
    const t = opts.templates?.[c];
    if (!t) return { tone: 'neutral', text: 'Template state could not be read.' };
    if (!t.registered) return { tone: 'red', text: 'No template is registered for this message — the gateway will refuse it.' };
    if (c === 'whatsapp' && t.approval_status && t.approval_status !== 'approved') {
      return { tone: 'amber', text: `Template ${t.provider_ref ?? ''} is ${t.approval_status} — WhatsApp sends only an approved one.` };
    }
    return { tone: 'green', text: c === 'whatsapp' ? 'Approved template — a summary goes, not the PDF.' : 'A summary goes, not the PDF.' };
  };

  const standingFor = (c: Ch) =>
    (opts?.consent?.standings ?? []).filter((s: any) => s.channel === c || s.channel === 'all');

  const send = async () => {
    const chosen = CH.filter((c) => picked[c.key]);
    if (!chosen.length) return;
    setBusy(true); setResults([]);
    const out: Outcome[] = [];
    for (const c of chosen) {
      const addr = c.addr === 'email' ? to.email.trim() : to.phone.trim();
      try {
        const r: any = await documentsAPI.send(documentId, { channel: c.key, to: addr || undefined });
        out.push({ channel: c.key, ok: !!r?.ok, status: r?.status, detail: r?.detail, dispatch_id: r?.dispatch_id ?? null });
      } catch (e) {
        out.push({ channel: c.key, ok: false, detail: errText(e) });
      }
      setResults([...out]);
    }
    setBusy(false);
    onSent?.();
  };

  const anyPicked = CH.some((c) => picked[c.key]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {label}</DialogTitle>
          <DialogDescription>
            Each channel you tick is sent separately through the store's messaging hub, and each one
            reports back on its own.
          </DialogDescription>
        </DialogHeader>

        {loading && <div className="py-6 text-center text-sm text-gray-500">Reading what can be sent…</div>}
        {loadErr && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr}</div>}

        {opts && !loading && (
          <div className="space-y-4 text-sm">
            {!opts.sendable && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                Only an issued document can be sent — issue it first. A draft has no number yet.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <TextInput type="email" value={to.email} onChange={(e) => setTo({ ...to, email: e.target.value })} placeholder="no email on the document" />
              </Field>
              <Field label="Phone (WhatsApp / SMS)">
                <TextInput value={to.phone} onChange={(e) => setTo({ ...to, phone: e.target.value })} placeholder="no phone on the document" />
              </Field>
            </div>

            <div className="space-y-2">
              {CH.map((c) => {
                const note = channelNote(c.key);
                const addr = c.addr === 'email' ? to.email : to.phone;
                const standings = standingFor(c.key);
                return (
                  <label key={c.key} className={`flex items-start gap-3 rounded-lg border p-3 ${picked[c.key] ? 'border-gray-400 bg-gray-50' : 'border-gray-200'}`}>
                    <input
                      type="checkbox" className="mt-1"
                      checked={picked[c.key]}
                      disabled={!addr.trim() || !opts.sendable}
                      onChange={(e) => setPicked({ ...picked, [c.key]: e.target.checked })}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium text-gray-900">
                        <c.icon className="h-4 w-4 text-gray-500" /> {c.label}
                        {!addr.trim() && <span className="text-xs font-normal text-gray-500">— no {c.addr} to send to</span>}
                      </span>
                      {note && <span className="mt-1 block"><Chip tone={note.tone}>{note.text}</Chip></span>}
                      {standings.length > 0 && (
                        <span className="mt-1 block text-xs text-gray-600">
                          On file: {standings.map((s: any) => `${s.purpose_category} ${s.status}`).join(' · ')}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {opts.consent && (
              <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <InfoTip text="An invoice is a transactional message, so marketing consent is not needed. An opt-out on a channel, or a missing template, can still stop it — the hub decides at send time." />
                <span>
                  {opts.consent.held_by_person
                    ? `Consent is held by the person themselves (Growcord ID): ${opts.consent.holder_reason}`
                    : opts.consent.holder_reason || 'Consent is kept by this store.'}
                  {opts.consent_required ? ' This message needs their consent.' : ' This message does not need marketing consent.'}
                </span>
              </div>
            )}
            {(opts.withheld ?? []).length > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Could not read: {opts.withheld.map((w: any) => `${w.block} (${w.reason})`).join('; ')}
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-1.5">
                {results.map((r) => (
                  <div key={r.channel} className={`rounded-lg px-3 py-2 text-sm ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    <span className="font-medium capitalize">{r.channel}:</span>{' '}
                    {r.ok ? 'sent' : (r.status ? `${r.status} — ` : '')}{r.ok ? '' : (r.detail ?? 'not sent')}
                    {r.dispatch_id && <span className="ml-1 font-mono text-xs opacity-80">· dispatch {r.dispatch_id.slice(0, 8)}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => onOpenChange(false)}>{results.length ? 'Close' : 'Cancel'}</Btn>
              <Btn variant="primary" disabled={busy || !anyPicked || !opts.sendable} onClick={send}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SendDocumentDialog;
