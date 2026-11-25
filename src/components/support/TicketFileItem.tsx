/**
 * One file of a ticket (TICKETS-1). The bytes are private: the page asks for a short signed link
 * (10 minutes) only once the file has scrolled into view, never on a timer. A link that ran out
 * while the page stayed open is asked for again when the person plays or opens the file.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useInView } from '@/components/panelAnalytics/useInView';
import { supportAPI } from '@/services/api';
import { bytesText } from '@/lib/v2/erp';
import type { TicketFile } from '@/lib/support';

interface Link { url: string; until: number }

const isVoice = (f: TicketFile) => f.kind === 'audio' && /^voice-note/i.test(f.file_name);

export default function TicketFileItem({ ticketId, file }: { ticketId: string; file: TicketFile }) {
  const [ref, inView] = useInView<HTMLDivElement>('120px');
  const [link, setLink] = useState<Link | null>(null);
  const [failed, setFailed] = useState(false);
  const asking = useRef(false);
  const retried = useRef(false);

  const fetchLink = useCallback(async (): Promise<string | null> => {
    if (asking.current) return null;
    asking.current = true;
    try {
      const d: any = await supportAPI.fileUrl(ticketId, file.id);
      const url = typeof d?.url === 'string' ? d.url : '';
      if (!url) { setFailed(true); return null; }
      const secs = Number(d?.expires_in ?? d?.expiresIn ?? 600) || 600;
      // A minute of margin: a link about to run out is renewed before it is used.
      setLink({ url, until: Date.now() + Math.max(30, secs - 60) * 1000 });
      setFailed(false);
      return url;
    } catch {
      setFailed(true);
      return null;
    } finally {
      asking.current = false;
    }
  }, [ticketId, file.id]);

  useEffect(() => {
    if (inView && !link && !failed) void fetchLink();
  }, [inView, link, failed, fetchLink]);

  /** A player or picture whose link ran out: one new link, once. */
  const onMediaError = () => {
    if (retried.current) { setLink(null); setFailed(true); return; }
    retried.current = true;
    void fetchLink();
  };

  /** Opening a document: a fresh link when the one on the page has run out. */
  const openFile = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (link && Date.now() < link.until) return;
    e.preventDefault();
    const url = await fetchLink();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const kind = String(file.kind);
  const name = isVoice(file) ? 'Voice note' : kind === 'screenshot' ? 'Screenshot' : file.file_name;
  const size = bytesText(file.size_bytes);

  let body: React.ReactNode;
  if (failed && !link) {
    body = (
      <button type="button" className="text-xs text-red-700 underline" onClick={() => { retried.current = false; setFailed(false); }}>
        Could not open {name}. Try again
      </button>
    );
  } else if (!link) {
    body = (
      <span className="flex h-16 w-40 items-center justify-center gap-2 rounded border border-gray-200 bg-gray-50 text-xs text-gray-500">
        <Loader2 className="size-3.5 animate-spin" /> Loading
      </span>
    );
  } else if (kind === 'image' || kind === 'screenshot') {
    body = (
      <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={openFile} title={`Open ${name}`}>
        <img
          src={link.url} alt={name} loading="lazy" onError={onMediaError}
          className="max-h-40 max-w-[240px] rounded border border-gray-200 bg-white object-contain"
        />
      </a>
    );
  } else if (kind === 'video') {
    body = <video controls preload="metadata" src={link.url} onError={onMediaError} className="max-h-64 w-full max-w-sm rounded border border-gray-200 bg-black" />;
  } else if (kind === 'audio') {
    body = <audio controls preload="metadata" src={link.url} onError={onMediaError} className="w-full max-w-xs" />;
  } else {
    body = (
      <a
        href={link.url} target="_blank" rel="noopener noreferrer" onClick={openFile}
        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
      >
        <FileText className="size-4 shrink-0 text-gray-500" />
        <span className="truncate">{file.file_name}</span>
        <Download className="size-4 shrink-0 text-gray-500" />
      </a>
    );
  }

  return (
    <div ref={ref} className="min-w-0 space-y-1" data-ticket-file={file.id}>
      {body}
      <div className="truncate text-[11px] text-gray-500">
        {kind === 'file' ? size : `${name}, ${size}`}
      </div>
    </div>
  );
}
