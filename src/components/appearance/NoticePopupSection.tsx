import React from 'react';
import { FaBullhorn } from 'react-icons/fa';
import ImageInputWithActions from '../common/ImageInputWithActions';

/**
 * Editor for the scheduled store notice popup (public `storePopup` setting,
 * Settings Center 11.7) — the message box both storefronts show every visitor
 * for a limited number of days.
 *
 * Lives inside Appearance ▸ Style & Branding next to the announcement bar,
 * because that is where staff look for "things shown on the website", and saves
 * through the page's existing bulk `PUT /settings`. The generated form in the
 * Settings Center edits the same key; this page adds what a generated form
 * cannot: a live preview and a plain statement of how many days it will run.
 *
 * WHAT THIS COMPONENT MUST NOT DO: decide the store's today. `today` is handed
 * down from `GET /settings/admin`, resolved by the backend in the store's own
 * timezone (CLAUDE.md rule 8). The status below is only an advisory preview of
 * what the saved value will do — the live popup is gated solely by the server's
 * own `isActive` (COMMON_MISTAKES #216).
 */

export interface NoticePopupForm {
  isEnabled: boolean;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  dismissLabel: string;
  startDate: string;
  endDate: string;
  frequency: 'every_visit' | 'once_per_session' | 'once_per_day' | 'once';
  placement: 'all' | 'home' | 'home_and_checkout';
  delaySeconds: number;
  bgColor: string;
  textColor: string;
  accentColor: string;
}

export const DEFAULT_NOTICE_POPUP: NoticePopupForm = {
  isEnabled: false,
  title: '',
  body: '',
  imageUrl: '',
  ctaLabel: '',
  ctaUrl: '',
  dismissLabel: 'Got it',
  startDate: '',
  endDate: '',
  frequency: 'once_per_day',
  placement: 'all',
  delaySeconds: 2,
  bgColor: '#FFFFFF',
  textColor: '#111827',
  accentColor: '#6A3D7C',
};

type Status = 'off' | 'empty' | 'scheduled' | 'live' | 'expired' | 'backwards';

/**
 * Mirrors `resolveStorePopup`'s status rule in `backend/src/utils/storePopup.ts`
 * so the editor can describe the value currently ON SCREEN (which the server has
 * not seen yet). It compares `YYYY-MM-DD` strings against the STORE's today as
 * supplied by the server — it never asks the browser what day it is.
 */
function previewStatus(p: NoticePopupForm, today: string): Status {
  if (!p.isEnabled) return 'off';
  if (!p.title.trim() && !p.body.trim()) return 'empty';
  if (p.startDate && p.endDate && p.endDate < p.startDate) return 'backwards';
  if (!today) return 'live';
  if (p.startDate && today < p.startDate) return 'scheduled';
  if (p.endDate && today > p.endDate) return 'expired';
  return 'live';
}

/** Inclusive day count of the window, or null when either end is open. */
function windowDays(p: NoticePopupForm): number | null {
  if (!p.startDate || !p.endDate) return null;
  const a = Date.parse(p.startDate + 'T00:00:00Z');
  const b = Date.parse(p.endDate + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

const STATUS_CHIP: Record<Status, { label: string; cls: string }> = {
  live: { label: 'Showing now', cls: 'bg-green-100 text-green-800 border-green-200' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  expired: { label: 'Finished', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  off: { label: 'Switched off', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  empty: { label: 'Nothing written yet', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  backwards: { label: 'Last day is before the first', cls: 'bg-red-100 text-red-800 border-red-200' },
};

const FREQUENCY_OPTIONS: Array<{ value: NoticePopupForm['frequency']; label: string }> = [
  { value: 'once_per_day', label: 'Once a day' },
  { value: 'once_per_session', label: 'Once per visit' },
  { value: 'once', label: 'Only once, ever' },
  { value: 'every_visit', label: 'Every page they open' },
];

const PLACEMENT_OPTIONS: Array<{ value: NoticePopupForm['placement']; label: string }> = [
  { value: 'all', label: 'Every page' },
  { value: 'home', label: 'Home page only' },
  { value: 'home_and_checkout', label: 'Home page, cart and checkout' },
];

interface Props {
  value: NoticePopupForm;
  onChange: (field: keyof NoticePopupForm, v: any) => void;
  /** The store's today (`YYYY-MM-DD`) as the BACKEND reckons it. */
  today: string;
  /** What the popup is doing on the website right now, per the saved value. */
  savedStatus?: string;
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50';

const NoticePopupSection: React.FC<Props> = ({ value, onChange, today, savedStatus }) => {
  const off = !value.isEnabled;
  const status = previewStatus(value, today);
  const chip = STATUS_CHIP[status];
  const days = windowDays(value);
  const hasCta = !!(value.ctaLabel && value.ctaUrl);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
          <FaBullhorn className="w-6 h-6 text-purple-600" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Notice Popup</h2>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${chip.cls}`}>
              {chip.label}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            A message box that opens over the website for a set number of days — holiday and closure
            notices, dispatch delays, announcements. Shown on both the main website and the
            single-product site.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.isEnabled}
            onChange={(e) => onChange('isEnabled', e.target.checked)}
            className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
          />
          <span className="text-sm font-medium text-gray-700">Show the notice popup</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Heading</label>
          <input
            type="text"
            value={value.title}
            onChange={(e) => onChange('title', e.target.value)}
            placeholder="Holiday notice"
            disabled={off}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
          <textarea
            rows={8}
            value={value.body}
            onChange={(e) => onChange('body', e.target.value)}
            placeholder={'Dear Customer,\nWe will be closed on…'}
            disabled={off}
            className={inputCls}
          />
          <p className="text-xs text-gray-500 mt-1">
            Press Enter for a new line — line breaks appear exactly as you type them. Emoji are fine.
            Styling tags are not supported.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">First day shown</label>
            <input
              type="date"
              value={value.startDate}
              onChange={(e) => onChange('startDate', e.target.value)}
              disabled={off}
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">Blank = starts as soon as it is switched on.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Last day shown <span className="font-normal text-gray-500">(included)</span>
            </label>
            <input
              type="date"
              value={value.endDate}
              onChange={(e) => onChange('endDate', e.target.value)}
              disabled={off}
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">Blank = keeps showing until you switch it off.</p>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          {days != null ? (
            <>
              Runs for <strong>{days} day{days === 1 ? '' : 's'}</strong> — {value.startDate} to{' '}
              {value.endDate} inclusive, in your store&rsquo;s own dates.
            </>
          ) : status === 'backwards' ? (
            <>The last day is before the first day — the notice would never appear.</>
          ) : (
            <>Set both dates to run the notice for a fixed number of days.</>
          )}
          {today ? <> Today at your store is <strong>{today}</strong>.</> : null}
          {savedStatus && savedStatus !== status ? (
            <> Currently saved on the website: <strong>{STATUS_CHIP[(savedStatus as Status)]?.label ?? savedStatus}</strong>.</>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">How often one visitor sees it</label>
            <select
              value={value.frequency}
              onChange={(e) => onChange('frequency', e.target.value)}
              disabled={off}
              className={inputCls}
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Where it appears</label>
            <select
              value={value.placement}
              onChange={(e) => onChange('placement', e.target.value)}
              disabled={off}
              className={inputCls}
            >
              {PLACEMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Open after (seconds)</label>
            <input
              type="number"
              min={0}
              max={60}
              step={1}
              value={value.delaySeconds}
              onChange={(e) => onChange('delaySeconds', e.target.value === '' ? 0 : Number(e.target.value))}
              disabled={off}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Button text (optional)</label>
            <input
              type="text"
              value={value.ctaLabel}
              onChange={(e) => onChange('ctaLabel', e.target.value)}
              placeholder="Shop now"
              disabled={off}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Button link</label>
            <input
              type="text"
              value={value.ctaUrl}
              onChange={(e) => onChange('ctaUrl', e.target.value)}
              placeholder="/products or https://..."
              disabled={off}
              className={inputCls}
            />
            {value.ctaLabel && !value.ctaUrl ? (
              <p className="text-xs text-amber-700 mt-1">Add a link, or the button will not be shown.</p>
            ) : null}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Close button text</label>
          <input
            type="text"
            value={value.dismissLabel}
            onChange={(e) => onChange('dismissLabel', e.target.value)}
            placeholder="Got it"
            disabled={off}
            className={`${inputCls} md:max-w-xs`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Image (optional)</label>
          <ImageInputWithActions
            value={value.imageUrl}
            onChange={(v) => onChange('imageUrl', v)}
            folder="settings"
            placeholder="https://… or pick from the library"
            disabled={off}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            ['bgColor', 'Background'],
            ['textColor', 'Text colour'],
            ['accentColor', 'Heading & button colour'],
          ] as Array<[keyof NoticePopupForm, string]>).map(([field, label]) => (
            <div key={String(field)}>
              <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={String(value[field] || '#000000')}
                  onChange={(e) => onChange(field, e.target.value)}
                  disabled={off}
                  className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={String(value[field] ?? '')}
                  onChange={(e) => onChange(field, e.target.value)}
                  disabled={off}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Preview — the same layout visitors see, rendered from the form values.
            The message is plain text with line breaks preserved, exactly as the
            storefront renders it. */}
        {(value.title || value.body) && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
            <div className="rounded-lg bg-gray-900/10 p-4">
              <div
                className="mx-auto max-w-md overflow-hidden rounded-2xl border border-gray-200 shadow-lg"
                style={{ backgroundColor: value.bgColor, color: value.textColor }}
              >
                {value.imageUrl ? (
                  <img src={value.imageUrl} alt="" className="w-full max-h-40 object-cover" />
                ) : null}
                <div className="px-5 py-5">
                  {value.title ? (
                    <h3 className="text-lg font-bold leading-snug" style={{ color: value.accentColor }}>
                      {value.title}
                    </h3>
                  ) : null}
                  {value.body ? (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{value.body}</p>
                  ) : null}
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <span
                      className="rounded-md border px-4 py-2 text-sm font-semibold"
                      style={{ borderColor: value.accentColor, color: value.accentColor }}
                    >
                      {value.dismissLabel || 'Got it'}
                    </span>
                    {hasCta ? (
                      <span
                        className="rounded-md px-4 py-2 text-center text-sm font-semibold text-white"
                        style={{ backgroundColor: value.accentColor }}
                      >
                        {value.ctaLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoticePopupSection;
