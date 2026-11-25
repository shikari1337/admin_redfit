/**
 * New ticket to Growcord (TICKETS-1, owner 25 Nov 2026: "priority, images, videos files screenshot
 * option and date timing ... related to option"). Saves the ticket, then sends its files in one
 * upload, then opens the ticket. Needs support.manage (the page shows the button only then).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Btn, Field, SelectInput, TextInput } from '@/components/erp';
import { errorText, supportAPI } from '@/services/api';
import { todayIso } from '@/utils/date';
import { PRIORITY_OPTIONS, RELATED_OPTIONS, dueAtFromInputs, type Attachment } from '@/lib/support';
import AttachmentPicker from './AttachmentPicker';
import { sendAttachments } from './sendAttachments';

export default function NewTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [relatedTo, setRelatedTo] = useState('');
  const [relatedRef, setRelatedRef] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSubject(''); setDescription(''); setPriority('normal'); setRelatedTo(''); setRelatedRef('');
    setDueDate(''); setDueTime(''); setFiles([]); setError(null);
  };

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim()) { setError('Write in one line what you need help with.'); return; }
    let due: string | undefined;
    if (dueDate) {
      const at = dueAtFromInputs(dueDate, dueTime);
      if (!at) { setError('The needed by date or time is not right.'); return; }
      if (new Date(at).getTime() < Date.now()) { setError('The needed by date and time is already past.'); return; }
      due = at;
    } else if (dueTime) {
      setError('Choose the date too, or clear the time.');
      return;
    }
    setSaving('Sending your ticket');
    let ticketId = '';
    try {
      const t: any = await supportAPI.create({
        subject: subject.trim(),
        description: description.trim() || undefined,
        priority,
        related_to: relatedTo || undefined,
        related_ref: relatedRef.trim() || undefined,
        due_at: due,
      });
      ticketId = String(t?.id ?? '');
      if (!ticketId) throw new Error('The ticket was not saved. Please try again.');
    } catch (err) {
      setError(errorText(err, 'The ticket could not be sent. Please try again.'));
      setSaving(null);
      return;
    }
    let notice: string | null = null;
    if (files.length) {
      setSaving(files.length === 1 ? 'Adding your file' : `Adding your ${files.length} files`);
      try {
        await sendAttachments(ticketId, files);
      } catch (err) {
        notice = `Your ticket was sent, but the files were not added: ${errorText(err, 'the upload failed')}. Add them again in a reply.`;
      }
    }
    setSaving(null);
    reset();
    onOpenChange(false);
    navigate(`/support/${ticketId}`, { state: notice ? { notice } : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ask Growcord for help</DialogTitle>
          <DialogDescription>Tell us what is wrong or what you need. Add a photo, a screenshot or a voice note if it helps.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit} data-new-ticket>
          <Field label="What do you need help with? (required)">
            <TextInput
              value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required autoFocus
              placeholder="For example: order not showing in the app"
            />
          </Field>
          <Field label="Tell us more">
            <Textarea
              value={description} onChange={(e) => setDescription(e.target.value)} maxLength={20000} rows={5}
              placeholder="What happened, what you expected, and the steps to see it"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How urgent is it?">
              <SelectInput value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="What is it about?">
              <SelectInput value={relatedTo} onChange={(e) => setRelatedTo(e.target.value)}>
                <option value="">Choose one</option>
                {RELATED_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </SelectInput>
            </Field>
          </div>
          <Field label="Order number, product code or invoice number (if any)">
            <TextInput value={relatedRef} onChange={(e) => setRelatedRef(e.target.value)} maxLength={120} placeholder="For example: ORD-10234" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Needed by (date)">
              <TextInput type="date" value={dueDate} min={todayIso()} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Needed by (time)">
              <TextInput type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} />
            </Field>
          </div>
          {dueDate && !dueTime && <p className="-mt-2 text-xs text-gray-500">No time chosen: we take 6:00 PM on that day.</p>}

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-gray-600">Photos, videos, files, voice note or screenshot</div>
            <AttachmentPicker items={files} onChange={setFiles} disabled={!!saving} />
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
            <Btn type="button" variant="outline" disabled={!!saving} onClick={() => close(false)}>Cancel</Btn>
            <Btn type="submit" disabled={!!saving || !subject.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Send />} {saving ?? 'Send to Growcord'}
            </Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
