import React, { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';

/**
 * Shared scan capture for the scanner workspace.
 *
 * Two capture paths:
 *  - keyboard wedge (default): hardware scanners type the code and send Enter —
 *    the input stays focused and submits on Enter. Works on every device.
 *  - camera: native BarcodeDetector (Chrome/Android). No external libs; the
 *    button only appears when the API exists.
 *
 * Feedback: WebAudio beep + navigator.vibrate on capture.
 */

export function scanFeedback(okBeep = true) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = okBeep ? 1200 : 320;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, okBeep ? 90 : 250);
    }
  } catch { /* audio blocked — fine */ }
  try { navigator.vibrate?.(okBeep ? 40 : [80, 40, 80]); } catch { /* no-op */ }
}

const ScanInput: React.FC<{
  placeholder?: string;
  autoFocus?: boolean;
  onScan: (code: string) => void;
  /** live-typing hook (POS autocomplete); scanners still submit via Enter */
  onQueryChange?: (value: string) => void;
}> = ({ placeholder = 'Scan or type a code', autoFocus = true, onScan, onQueryChange }) => {
  const [value, setValue] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasDetector = typeof (window as any).BarcodeDetector !== 'undefined';

  const submit = (code: string) => {
    const c = code.trim();
    if (!c) return;
    scanFeedback(true);
    setValue('');
    onScan(c);
  };

  useEffect(() => {
    if (!cameraOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'],
        });
        const tick = async () => {
          if (cancelled || !videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              setCameraOn(false);
              submit(codes[0].rawValue);
              return;
            }
          } catch { /* frame not ready */ }
          setTimeout(tick, 180);
        };
        tick();
      } catch {
        scanFeedback(false);
        setCameraOn(false);
      }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [cameraOn]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); onQueryChange?.(e.target.value); }}
          onKeyDown={(e) => e.key === 'Enter' && submit(value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded-lg border-2 border-gray-200 px-3 py-3 font-mono text-base focus:border-gray-900 focus:outline-none"
        />
        <button onClick={() => submit(value)}
                className="rounded-lg bg-gray-900 px-5 py-3 text-base font-semibold text-white hover:bg-gray-800">Go</button>
        {hasDetector && (
          <button onClick={() => setCameraOn((v) => !v)} aria-label="Scan with camera"
                  className={`flex items-center rounded-lg border-2 px-3 py-3 ${cameraOn ? 'border-red-600 text-red-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Camera className="h-5 w-5" />
          </button>
        )}
      </div>
      {cameraOn && (
        <video ref={videoRef} muted playsInline
               className="aspect-video w-full rounded-lg border bg-black object-cover" />
      )}
    </div>
  );
};

export default ScanInput;
