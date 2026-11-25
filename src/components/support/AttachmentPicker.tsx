/**
 * Attachments for a support ticket or a reply (TICKETS-1, owner 25 Nov 2026: "voice recording
 * ... images, videos files screenshot option"). Three ways to add, one list to check before sending:
 *
 *   Choose files     photos, videos, documents (sent under the `file` field)
 *   Record voice     the microphone through MediaRecorder, at most 5 minutes (`audio` field)
 *   Take screenshot  one picture of a screen or window the person picks (`screenshot` field)
 *
 * Nothing is uploaded here: the parent sends the list after the ticket or the reply is saved.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText, Film, Image as ImageIcon, Mic, Monitor, Paperclip, Square, X } from 'lucide-react';
import { Btn } from '@/components/erp';
import { bytesText } from '@/lib/v2/erp';
import { FILE_ACCEPT, MAX_FILES, MAX_FILE_BYTES, type Attachment } from '@/lib/support';

/** The longest voice note, in seconds. */
const MAX_VOICE_SECONDS = 5 * 60;

let seq = 0;
const nextKey = () => `att-${Date.now().toString(36)}-${(seq += 1)}`;

const twoDigits = (n: number) => String(n).padStart(2, '0');
const clock = (secs: number) => `${Math.floor(secs / 60)}:${twoDigits(Math.floor(secs % 60))}`;
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${twoDigits(d.getMonth() + 1)}${twoDigits(d.getDate())}-${twoDigits(d.getHours())}${twoDigits(d.getMinutes())}${twoDigits(d.getSeconds())}`;
};

/** The recording format this browser can make, best first (WebM is what the server reads as a voice note). */
function voiceMime(): string | null {
  const MR = typeof window !== 'undefined' ? (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder : undefined;
  if (!MR || !navigator.mediaDevices?.getUserMedia) return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']) {
    try { if (MR.isTypeSupported?.(m)) return m; } catch { /* keep looking */ }
  }
  return '';
}

function kindOf(file: File): Attachment['kind'] {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'file';
}

/** One picture of the screen or window the person picks; the sharing stops at once. */
async function grabScreen(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth) {
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
    }
    // Let the browser's "choose what to share" box close before the picture is taken.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height) throw new Error('The screen picture came out empty.');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The screen picture could not be saved.');
    video.srcObject = null;
    return blob;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

const errName = (e: unknown) => (e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '');

export default function AttachmentPicker({ items, onChange, disabled }: {
  items: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  // The voice recorder.
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keepRecording = useRef(true);
  const startedAt = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Local previews of attachments that left the list are released.
  const shown = useRef<Attachment[]>(items);
  useEffect(() => {
    const now = new Set(items.map((a) => a.key));
    for (const a of shown.current) if (!now.has(a.key) && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    shown.current = items;
  }, [items]);
  useEffect(() => () => {
    for (const a of shown.current) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    const r = recorder.current;
    if (r && r.state !== 'inactive') { keepRecording.current = false; r.stop(); }
  }, []);

  // The visible timer while recording (a clock on screen, never a server call); stops at 5 minutes.
  useEffect(() => {
    if (!recording) return undefined;
    const t = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(s);
      const r = recorder.current;
      if (s >= MAX_VOICE_SECONDS && r && r.state !== 'inactive') r.stop();
    }, 250);
    return () => clearInterval(t);
  }, [recording]);

  const room = MAX_FILES - items.length;
  const full = room <= 0;

  const add = (more: Attachment[]) => onChangeRef.current([...itemsRef.current, ...more]);

  const remove = (key: string) => onChange(items.filter((a) => a.key !== key));

  const pickFiles = (list: FileList | null) => {
    if (!list || !list.length) return;
    const msgs: string[] = [];
    const ok: Attachment[] = [];
    for (const f of Array.from(list)) {
      if (ok.length >= room) { msgs.push(`Only ${MAX_FILES} files can go at once. ${f.name} was left out.`); continue; }
      if (f.size === 0) { msgs.push(`${f.name} is empty.`); continue; }
      if (f.size > MAX_FILE_BYTES) { msgs.push(`${f.name} is larger than 50 MB.`); continue; }
      if (/svg|html|xml|javascript/i.test(f.type) || /\.(svg|html?|js)$/i.test(f.name)) {
        msgs.push(`${f.name} is not a file a ticket takes.`);
        continue;
      }
      const kind = kindOf(f);
      ok.push({
        key: nextKey(), field: 'file', blob: f, name: f.name, kind,
        previewUrl: kind === 'image' || kind === 'audio' ? URL.createObjectURL(f) : undefined,
      });
    }
    if (ok.length) add(ok);
    setNote(msgs.length ? msgs.join(' ') : null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const startVoice = async () => {
    setNote(null);
    const mime = voiceMime();
    if (mime === null) {
      setNote('This browser cannot record voice. Record on your phone and add the file with Choose files.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const n = errName(e);
      setNote(n === 'NotAllowedError' || n === 'SecurityError'
        ? 'The microphone was not allowed. Allow the microphone for this site in the browser, then try again.'
        : n === 'NotFoundError' ? 'No microphone was found on this computer.'
          : 'The microphone could not be started.');
      return;
    }
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setNote('This browser cannot record voice. Record on your phone and add the file with Choose files.');
      return;
    }
    chunks.current = [];
    keepRecording.current = true;
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.current.push(ev.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      recorder.current = null;
      if (!keepRecording.current) return;
      const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks.current, { type });
      chunks.current = [];
      if (!blob.size) { setNote('Nothing was recorded. Try again.'); return; }
      const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
      // The server takes WebM and Ogg recordings as voice notes; any other recording goes as a file.
      const field = ext === 'webm' || ext === 'ogg' ? 'audio' : 'file';
      add([{ key: nextKey(), field, blob, name: `voice-note-${stamp()}.${ext}`, kind: 'audio', previewUrl: URL.createObjectURL(blob) }]);
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start(1000);
    setRecording(true);
  };

  const stopVoice = (keep: boolean) => {
    keepRecording.current = keep;
    const r = recorder.current;
    if (r && r.state !== 'inactive') r.stop();
  };

  const takeScreenshot = async () => {
    setNote(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNote('This browser cannot take a screenshot. Take one with your computer or phone and add it with Choose files.');
      return;
    }
    setGrabbing(true);
    try {
      const blob = await grabScreen();
      add([{ key: nextKey(), field: 'screenshot', blob, name: `screenshot-${stamp()}.png`, kind: 'screenshot', previewUrl: URL.createObjectURL(blob) }]);
    } catch (e) {
      const n = errName(e);
      setNote(n === 'NotAllowedError' || n === 'AbortError'
        ? 'No screenshot was taken: sharing the screen was cancelled or not allowed.'
        : n === 'NotSupportedError' ? 'This browser cannot take a screenshot. Take one with your computer or phone and add it with Choose files.'
          : 'The screenshot could not be taken. Try again, or add a picture with Choose files.');
    } finally {
      setGrabbing(false);
    }
  };

  return (
    <div className="space-y-2" data-attachment-picker>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput} type="file" multiple accept={FILE_ACCEPT} className="hidden"
          onChange={(e) => pickFiles(e.target.files)} aria-label="Choose files"
        />
        <Btn type="button" size="sm" variant="outline" disabled={disabled || full || recording} onClick={() => fileInput.current?.click()}>
          <Paperclip /> Choose files
        </Btn>
        {!recording ? (
          <Btn type="button" size="sm" variant="outline" disabled={disabled || full} onClick={startVoice}>
            <Mic /> Record voice
          </Btn>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700" role="status">
            <span className="size-2 animate-pulse rounded-full bg-red-600" aria-hidden />
            Recording {clock(seconds)} of {clock(MAX_VOICE_SECONDS)}
            <Btn type="button" size="sm" variant="primary" className="h-7" onClick={() => stopVoice(true)}>
              <Square /> Stop
            </Btn>
            <Btn type="button" size="sm" variant="ghost" className="h-7" onClick={() => stopVoice(false)}>
              Cancel
            </Btn>
          </span>
        )}
        <Btn type="button" size="sm" variant="outline" disabled={disabled || full || recording || grabbing} onClick={takeScreenshot}>
          <Monitor /> {grabbing ? 'Taking screenshot...' : 'Take screenshot'}
        </Btn>
        <span className="text-xs text-gray-500">
          {full ? `${MAX_FILES} files added, the most at once.` : `Up to ${MAX_FILES} files, 50 MB each.`}
        </span>
      </div>

      {note && <p className="text-xs text-red-700" role="alert">{note}</p>}

      {items.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white" aria-label="Files to send">
          {items.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
              {(a.kind === 'image' || a.kind === 'screenshot') && a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="size-12 shrink-0 rounded border border-gray-200 object-cover" />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-500">
                  {a.kind === 'audio' ? <Mic className="size-5" /> : a.kind === 'video' ? <Film className="size-5" /> : a.kind === 'image' ? <ImageIcon className="size-5" /> : <FileText className="size-5" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-gray-900">
                  {a.field === 'audio' || (a.kind === 'audio' && a.name.startsWith('voice-note')) ? 'Voice note' : a.kind === 'screenshot' ? 'Screenshot' : a.name}
                </div>
                <div className="text-xs text-gray-500">{bytesText(a.blob.size)}</div>
                {a.kind === 'audio' && a.previewUrl && (
                  <audio controls src={a.previewUrl} className="mt-1 h-8 w-full max-w-xs" preload="metadata" />
                )}
              </div>
              <Btn type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => remove(a.key)} aria-label={`Remove ${a.name}`}>
                <X /> Remove
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
