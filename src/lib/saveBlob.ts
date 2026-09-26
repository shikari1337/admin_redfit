/**
 * Hand a file to the browser — ONE definition (2026-09-26).
 *
 * Owner: "getting network error for staff account, make sure they can download it."
 *
 * Nine components each carried the same five lines: make an object URL, click
 * an anchor, revoke the URL on the very next statement. That last line is the
 * bug. The click only SCHEDULES the download; Chrome's download manager opens
 * the URL a moment later, and on a large file (the inventory sheet is 31.9 MB)
 * or a slower machine the URL is already gone — which the download bar reports
 * as "Failed – Network error". Two other components in this codebase had
 * already learned to delay the revoke; the rest had not. Now there is one place
 * to get it right.
 *
 * Prefer `saveFromUrl` when the server can hand out a link: the browser then
 * streams straight to disk with its own progress bar and nothing is held in
 * page memory. `saveBlob` remains for responses that only exist as a Blob.
 */

/** Keep the object URL alive long enough for a slow download manager to open it. */
const REVOKE_AFTER_MS = 60_000;

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Remove the anchor now; revoke the URL later. The download has been handed
  // to the browser, but it reads the blob through this URL asynchronously.
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/**
 * Let the browser download a URL natively (a signed download link). The
 * `download` attribute is honoured for same-origin and blob URLs only; for a
 * cross-origin API host the server's Content-Disposition names the file, and
 * the attribute is a harmless hint.
 */
export function saveFromUrl(url: string, filename?: string): void {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
