import { Link } from 'react-router-dom';

/**
 * WHICH FILE CHANGES WHAT.
 *
 * Owner: admin Inventory and the Batches page "are getting confused".
 *
 * They are two pages with near-identical Excel flows over two sheets that share
 * a header prefix, and until now nothing on either screen said which of them
 * changes stock. This strip says it, in the same words, on both pages — ONE
 * component mounted twice, so the two can never drift into saying different
 * things about the same two files.
 *
 * The last line is the part that ends the confusion for good: a file dropped on
 * the wrong page is no longer refused, it is routed
 * (`POST /inventory/import/any`). Saying so here is what stops someone
 * second-guessing which button to press.
 */
export default function WhichSheetStrip({ here }: { here: 'inventory' | 'batches' }) {
  const box: React.CSSProperties = {
    flex: '1 1 260px', minWidth: 0, borderRadius: 8, padding: '10px 12px',
    border: '1px solid #e2e8f0', background: '#fff',
  };
  const mine: React.CSSProperties = { ...box, borderColor: '#0f766e', background: '#f0fdfa' };
  const name: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 };
  const body: React.CSSProperties = { fontSize: 12, color: '#475569', lineHeight: 1.45 };
  const tag: React.CSSProperties = {
    marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
    color: '#0f766e',
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc',
                  padding: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
        Which file changes what
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={here === 'inventory' ? mine : box}>
          <div style={name}>
            Inventory sheet <span style={{ fontWeight: 400, color: '#64748b' }}>(inventory-….xlsx)</span>
            {here === 'inventory' && <span style={tag}>this page</span>}
          </div>
          <div style={body}>
            Prices, MRP, B2B price, HSN and pack size, one row per SKU.{' '}
            <strong>Stock is read-only here</strong> for any SKU held in batches.
            {here !== 'inventory' && (
              <> <Link to="/panel/inventory" style={{ color: '#0f766e' }}>Open Inventory</Link>.</>
            )}
          </div>
        </div>
        <div style={here === 'batches' ? mine : box}>
          <div style={name}>
            Batches sheet <span style={{ fontWeight: 400, color: '#64748b' }}>(batches-….xlsx)</span>
            {here === 'batches' && <span style={tag}>this page</span>}
          </div>
          <div style={body}>
            The quantity of every lot, its printed MRP and its expiry.{' '}
            <strong>This is the file that changes stock.</strong>
            {here !== 'batches' && (
              <> <Link to="/panel/inventory/batches" style={{ color: '#0f766e' }}>Open Batches &amp; Expiry</Link>.</>
            )}
          </div>
        </div>
      </div>
      <div style={{ ...body, marginTop: 8 }}>
        Drop either file on either page — it is sent to the right importer for you. A big sheet is
        applied in the background and its progress appears under Downloads, so you can leave the page.
      </div>
    </div>
  );
}
