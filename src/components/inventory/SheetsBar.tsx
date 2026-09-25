import { useState } from 'react';
import WhichSheetStrip from './WhichSheetStrip';
import DownloadsPanel from './DownloadsPanel';

/**
 * ONE block for "sheets and downloads", instead of two panels stacked above
 * every table.
 *
 * Inventory showed a tall "which file changes what" card and, under it, a
 * second "Downloads & imports" card — together most of a screen of chrome
 * before the first row of data. Both are still needed; neither needs to be
 * open all the time.
 *
 * So: one line that answers the question, a link that opens the full
 * explanation when someone actually wants it, and the download/import rows in
 * the same frame. `DownloadsPanel` already renders nothing when there is
 * nothing in flight, so on a quiet day this is a single 36px line.
 *
 * Both halves are the EXISTING components, mounted — not reimplemented — so
 * Inventory and Batches can never drift into saying different things about the
 * same two files.
 */
export default function SheetsBar({
  here, refreshToken,
}: { here: 'inventory' | 'batches'; refreshToken?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      border: '1px solid var(--n-200)', borderRadius: 8, background: 'var(--surface)',
      marginBottom: 16, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 12px', fontSize: 12.5, color: 'var(--n-600)', background: 'var(--n-50)',
      }}>
        <strong style={{ color: 'var(--n-900)', fontWeight: 600 }}>Excel</strong>
        <span>
          {here === 'inventory'
            ? 'Prices, MRP, B2B and HSN are on the Inventory sheet. Quantity is on the Batches sheet.'
            : 'Quantity, printed MRP and expiry are on the Batches sheet. Catalogue prices are on the Inventory sheet.'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid="sheets-bar-toggle"
          aria-expanded={open}
          style={{
            marginLeft: 'auto', border: '1px solid var(--n-200)', background: 'var(--surface)',
            borderRadius: 6, padding: '3px 9px', fontSize: 11.5, color: 'var(--n-700)', cursor: 'pointer',
          }}
        >
          {open ? 'Hide the detail' : 'Which file changes what'}
        </button>
      </div>

      {open && (
        <div style={{ padding: '12px 12px 0' }}>
          <WhichSheetStrip here={here} />
        </div>
      )}

      {/* Renders nothing at all when no file is being built and none has been
          sent back — so this stays one line until there is something to report. */}
      <DownloadsPanel refreshToken={refreshToken} embedded />
    </div>
  );
}
