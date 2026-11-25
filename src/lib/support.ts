/**
 * Help and support (TICKETS-1, owner 25 Nov 2026): the store's tickets to Growcord.
 *
 * The shapes are the backend's own views (growcord-rs apps/platform/core/src/api/support_tickets.rs:
 * TicketView, TicketMessageView, TicketFileView, TicketDetailView). The backend has no route that
 * lists the allowed priorities, topics and statuses; the lists below are its closed lists
 * (PRIORITIES, RELATED, STATUSES in that file), each with the plain words a store reads.
 */

export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_store' | 'resolved' | 'closed';
/** Who wrote: the store, Growcord, or a system line (a status change). */
export type TicketAuthor = 'store' | 'growcord' | 'system';
export type TicketFileKind = 'image' | 'video' | 'audio' | 'screenshot' | 'file';
/** The multipart field a file is sent under. */
export type UploadField = 'file' | 'audio' | 'screenshot';

export interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  priority: TicketPriority | string;
  related_to: string;
  related_ref: string | null;
  status: TicketStatus | string;
  due_at: string | null;
  /** The Growcord staff member it is assigned to (name only). */
  assigned_to_name: string | null;
  raised_by_name: string;
  last_message_at: string | null;
  last_message_by: TicketAuthor | string;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  file_count: number;
  message_count: number;
}

export interface TicketMessage {
  id: string;
  author_kind: TicketAuthor | string;
  author_name: string;
  body: string;
  internal: boolean;
  created_at: string | null;
}

export interface TicketFile {
  id: string;
  message_id: string | null;
  kind: TicketFileKind | string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  internal: boolean;
  uploaded_by_kind: 'store' | 'growcord' | string;
  uploaded_by: string;
  created_at: string | null;
}

export interface TicketDetail {
  ticket: Ticket;
  messages: TicketMessage[];
  files: TicketFile[];
}

export const PRIORITY_OPTIONS: ReadonlyArray<{ value: TicketPriority; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export const RELATED_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'order', label: 'An order' },
  { value: 'product', label: 'A product' },
  { value: 'shipment', label: 'A shipment or courier' },
  { value: 'payment', label: 'A payment' },
  { value: 'billing', label: 'Growcord billing' },
  { value: 'storefront', label: 'The website (storefront)' },
  { value: 'admin_panel', label: 'This admin panel' },
  { value: 'app', label: 'The mobile app' },
  { value: 'integration', label: 'A connection to another service' },
  { value: 'account', label: 'Our account or login' },
  { value: 'other', label: 'Something else' },
];

const STATUS_TEXT: Record<string, string> = {
  open: 'Open',
  in_progress: 'Growcord is working on it',
  waiting_store: 'Waiting for your reply',
  resolved: 'Solved',
  closed: 'Closed',
};

/** The chip colour of a status (the kit's StatusChip tones). */
export const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  open: 'amber',
  in_progress: 'blue',
  waiting_store: 'red',
  resolved: 'green',
  closed: 'neutral',
};

export const PRIORITY_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  urgent: 'red',
  high: 'amber',
  normal: 'blue',
  low: 'neutral',
};

const words = (v: string) => {
  const s = String(v || '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
};

export const statusText = (s: string | null | undefined): string => STATUS_TEXT[String(s ?? '')] ?? words(String(s ?? ''));
export const priorityText = (p: string | null | undefined): string =>
  PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? words(String(p ?? ''));
export const relatedText = (r: string | null | undefined): string =>
  RELATED_OPTIONS.find((o) => o.value === r)?.label ?? words(String(r ?? ''));

/** Limits of one upload request (support_tickets.rs MAX_FILE, MAX_FILES, MAX_BODY). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 5;
const MAX_REQUEST_BYTES = 2 * MAX_FILE_BYTES;

/** What the file picker offers: photos, videos, audio, PDF, office files, ZIP and plain text. */
export const FILE_ACCEPT = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff',
  'video/*', 'audio/*', 'application/pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf',
  '.zip', '.txt', '.csv', '.log',
].join(',');

/** A file waiting to be sent with a new ticket or a reply. */
export interface Attachment {
  key: string;
  field: UploadField;
  blob: Blob;
  name: string;
  /** Kind shown in the list before sending. */
  kind: 'image' | 'video' | 'audio' | 'screenshot' | 'file';
  /** A local preview link (revoked when the attachment is removed). */
  previewUrl?: string;
}

/**
 * The attachments in upload requests the server takes: at most 5 files and about 100 MB in
 * one request (its body limit), so a large set goes in more than one request.
 */
export function uploadGroups(items: Attachment[]): Attachment[][] {
  const groups: Attachment[][] = [];
  let cur: Attachment[] = [];
  let size = 0;
  for (const a of items) {
    if (cur.length && (cur.length >= MAX_FILES || size + a.blob.size > MAX_REQUEST_BYTES)) {
      groups.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(a);
    size += a.blob.size;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * A date (`YYYY-MM-DD`) and a time (`HH:mm`) typed in the browser, as an RFC 3339 instant with
 * the browser's own offset ("2026-11-26T17:30:00+05:30"). The time defaults to the end of the
 * working day (18:00) when only the date is given. null when the date is empty or unreadable.
 */
export function dueAtFromInputs(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!d) return null;
  const t = /^(\d{2}):(\d{2})/.exec((time || '18:00').trim()) ?? ['', '18', '00'];
  const local = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0);
  if (Number.isNaN(local.getTime())) return null;
  const off = -local.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d[1]}-${d[2]}-${d[3]}T${pad(Number(t[1]))}:${pad(Number(t[2]))}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The ticket's answer from the list call (an array) or the detail call ({ticket, messages, files}). */
export const asTickets = (d: unknown): Ticket[] => (Array.isArray(d) ? (d as Ticket[]) : []);

export function asDetail(d: unknown): TicketDetail | null {
  const o = d as Partial<TicketDetail> | null;
  if (!o || typeof o !== 'object' || !o.ticket) return null;
  return {
    ticket: o.ticket as Ticket,
    messages: Array.isArray(o.messages) ? o.messages : [],
    files: Array.isArray(o.files) ? o.files : [],
  };
}
