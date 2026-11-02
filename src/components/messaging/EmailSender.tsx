import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Chip, BlockSkeleton } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { messagingAPI, errText, type EmailConfig, type EmailConfigInput } from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';
import { AccountBanner, ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * Email ▸ Sender & SMTP: who the store's email comes from, and through which
 * server — Growcord's own mail service, or the store's SMTP account
 * (`GET/PUT /comms/email/config`, `POST /comms/email/test`, contract §4.5; the
 * SAME `smtp` store setting the email provider reads). The password is
 * write-only: the server only says whether one is saved, and an empty box
 * leaves it as it is.
 *
 * Permissions are the `smtp` setting's own (`settings.read` / `settings.manage`,
 * MSG-2 `channel_config.rs`), not the template pair. The From name is always
 * the store's name and the Reply-To the store's support email — both set in
 * Branding, shown here read-only (the server accepts them only unchanged).
 * Lane ADMIN-MSG-1, reconciled by ADMIN-MSG-2.
 */
type Form = {
  mode: 'platform' | 'own'; from_email: string;
  host: string; port: string; secure: boolean; username: string; password: string;
};
const formOf = (c: EmailConfig): Form => ({
  mode: c.mode, from_email: c.from_email ?? '',
  host: c.host ?? '', port: c.port ? String(c.port) : '', secure: c.secure, username: c.username ?? '', password: '',
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmailSender: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<EmailConfig | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [to, setTo] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try { const c = await messagingAPI.emailConfig(); setCfg(c); setForm(formOf(c)); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the email sender.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const base = useMemo(() => (cfg ? formOf(cfg) : null), [cfg]);
  const dirty = !!form && !!base && JSON.stringify(form) !== JSON.stringify(base);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const problems = useMemo(() => {
    if (!form) return [] as string[];
    const p: string[] = [];
    if (form.mode === 'own' && form.from_email && !EMAIL.test(form.from_email)) p.push('The from address is not an email address.');
    if (form.mode === 'own') {
      if (!form.host.trim()) p.push('Your SMTP server needs a host.');
      const port = Number(form.port);
      if (!form.port || !Number.isInteger(port) || port < 1 || port > 65535) p.push('The port is a number from 1 to 65535 (465 with TLS, 587 without).');
    }
    return p;
  }, [form]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      // from_name / reply_to are never sent: they come from the store's details and Branding.
      const body: EmailConfigInput = { mode: form.mode };
      if (form.mode === 'own') {
        // On Growcord's account the address is Growcord's sending address (MSG-0 §3); only your own server takes one.
        body.from_email = form.from_email.trim() || null;
        Object.assign(body, { host: form.host.trim() || null, port: Number(form.port) || null, secure: form.secure, username: form.username.trim() || null });
        // Write-only: sent only when typed; an empty box keeps the saved one.
        if (form.password) body.password = form.password;
      }
      const c = await messagingAPI.saveEmailConfig(body);
      setCfg(c); setForm(formOf(c));
      toast({ title: 'Email sender saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Not saved', description: errText(e, 'The server refused the change.') });
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await messagingAPI.testEmail(to.trim());
      toast({ variant: r.ok ? undefined : 'destructive', title: r.ok ? `Test email sent to ${to.trim()}` : 'Test email not sent', description: r.message });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Test email not sent', description: failureOf(e, '').gap ? 'The test route is not on this server yet.' : errText(e, 'The test was refused.') });
    } finally { setTesting(false); }
  };

  if (failure?.gap) {
    return (
      <GapNotice what="The email sender route (GET /comms/email/config) is not on this server yet.">
        The SMTP account can still be entered on <Link className="underline" to="/settings?key=smtp">Settings ▸ Email (SMTP)</Link>.
      </GapNotice>
    );
  }
  if (failure) return <ErrorNotice message={failure.message} onRetry={load} />;
  if (!cfg || !form) return <BlockSkeleton lines={8} />;
  const readOnlyBox = (label: string, value: string, help: React.ReactNode) => (
    <div className="space-y-1 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <p className="flex min-h-9 items-center break-all rounded-md border border-line bg-surface-2 px-3 py-1.5 text-ink-soft">{value}</p>
      <span className="block text-[11px] text-ink-soft">{help}</span>
    </div>
  );
  const brandingLink = <Link className="underline" to="/messaging/email?tab=branding">set in Branding</Link>;

  const field = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, help?: string) => (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <Input value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value as any)} className="h-9" {...props} />
      {help && <span className="block text-[11px] text-ink-soft">{help}</span>}
    </label>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <fieldset className="space-y-4 rounded-lg border border-line bg-surface p-4" disabled={!canWrite}>
        <legend className="px-1 text-sm font-semibold text-ink">Who it comes from</legend>
        <AccountBanner own={cfg.mode === 'own'}>
          <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-2 gap-y-0.5">
            <dt>From name</dt><dd className="min-w-0 break-words">{cfg.from_name || 'Your store’s name'}</dd>
            <dt>Sending address</dt><dd className="min-w-0 break-all">{cfg.from_email || (cfg.mode === 'own' ? 'Not set' : 'Growcord’s sending address')}</dd>
            <dt>Reply-To</dt><dd className="min-w-0 break-all">{cfg.reply_to || 'Not set — replies go to the sending address'}</dd>
          </dl>
          {cfg.mode !== 'own' && <p className="mt-1">Customers see your store’s name; replies come to your Reply-To address.</p>}
        </AccountBanner>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={cfg.live ? 'green' : 'amber'}>{cfg.live ? 'Live' : 'Test mode'}</Chip>
          {cfg.note && <span className="text-xs text-ink-soft">{cfg.note}</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['platform', 'Growcord’s mail service', 'Nothing to set up. Your store name is the sender.'],
            ['own', 'Your own SMTP server', 'Mail goes out from your own domain (for example Google Workspace or Zoho).']] as const).map(([v, label, hint]) => (
            <label key={v} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm', form.mode === v ? 'border-brand bg-brand/5' : 'border-line', !canWrite && 'cursor-not-allowed opacity-70')}>
              <input type="radio" name="email-mode" className="mt-0.5" checked={form.mode === v} onChange={() => set('mode', v)} />
              <span><span className="block font-medium text-ink">{label}</span><span className="mt-0.5 block text-xs text-ink-soft">{hint}</span></span>
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {readOnlyBox('From name', cfg.from_name || 'Your store’s name', <>Always your store’s name — {brandingLink} and the store details.</>)}
          {form.mode === 'own'
            ? field('from_email', 'Sending address', { type: 'email', inputMode: 'email', placeholder: 'orders@yourstore.com' }, 'On your own domain, so mail is not marked as spam.')
            : (
              <div className="space-y-1 text-sm">
                <span className="font-medium text-ink">Sending address</span>
                <p className="flex h-9 items-center rounded-md border border-line bg-surface-2 px-3 text-ink-soft">{cfg.from_email || 'Growcord’s sending address'}</p>
                <span className="block text-[11px] text-ink-soft">Set by Growcord on its account. Switch to your own server to use your domain.</span>
              </div>
            )}
          {readOnlyBox('Reply-to', cfg.reply_to || 'Not set — replies go to the sending address', <>Your support email, {brandingLink}. Where a customer’s reply lands.</>)}
        </div>
        {form.mode === 'own' && (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            {field('host', 'SMTP host', { placeholder: 'smtp.yourprovider.com', autoComplete: 'off' })}
            {field('port', 'Port', { inputMode: 'numeric', placeholder: '465' })}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Switch checked={form.secure} onCheckedChange={(v) => set('secure', v)} aria-label="Use TLS" disabled={!canWrite} />
              <span className="text-ink">Use TLS <span className="text-xs text-ink-soft">(on for port 465, off for 587)</span></span>
            </label>
            {field('username', 'Username', { autoComplete: 'off' })}
            {field('password', 'Password', {
              type: 'password', autoComplete: 'new-password',
              placeholder: cfg.password_set ? 'Saved — type to replace' : 'Not saved yet',
            }, cfg.password_set ? 'Never shown. Leave empty to keep the saved one.' : undefined)}
          </div>
        )}
        {problems.length > 0 && <ul className="space-y-0.5 text-xs text-bad-ink">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {!canWrite && <span className="mr-auto text-xs text-ink-soft">Read-only: needs the settings.manage permission.</span>}
          <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setForm(formOf(cfg))}>Discard</Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving || problems.length > 0}
            title={!dirty ? 'Nothing changed yet' : problems.length ? problems[0] : undefined}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
          </Button>
        </div>
      </fieldset>

      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Test email</p>
          <p className="mb-2 text-xs text-ink-soft">Sends one test email with the saved settings. Save first if you changed anything.</p>
          <div className="flex flex-wrap gap-2">
            <Input type="email" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com"
              aria-label="Address for the test email" className="h-9 w-full sm:w-64" />
            <Button size="sm" className="h-9" onClick={test} disabled={testing || !EMAIL.test(to.trim()) || dirty || !canWrite}
              title={!canWrite ? 'Needs the settings.manage permission' : dirty ? 'Save your changes first — the test uses the saved settings' : !EMAIL.test(to.trim()) ? 'Type an email address' : undefined}>
              {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send test
            </Button>
          </div>
        </div>
        <Link to="/settings?key=smtp" className="inline-flex items-center gap-1 text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
          <ExternalLink className="h-3 w-3" /> The same setting in the Settings Center
        </Link>
      </div>
    </div>
  );
};

export default EmailSender;
