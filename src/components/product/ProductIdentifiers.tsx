import React from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { SwitchRow, fieldInputCls, fieldInputErrorCls } from './FormField';
import {
  IDENTIFIER_TYPES, blankRow, codeValueOf, draftChanged, draftErrors, googleSeesLine, labelCodesOf, typeLabel,
  withNoIdentifier,
  type IdentifierRow, type IdentifierType, type IdentifiersDraft, type IdentifiersRead, type RowErrors,
} from '../../lib/productIdentifiers';

/**
 * PRODUCT-ID: one variation's product identifiers. Rows of type and value (barcode, ISBN, store
 * code, part number), checked while typing; a switch for an item that has none; the WMS label
 * codes shown read-only; the saved "Google sees" line. State lives with the caller (`draft`), so
 * the product form and the variation page save it with their own Save.
 */
const TONE: Record<string, string> = {
  good: 'border-green-200 bg-green-50 text-green-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  muted: 'border-gray-200 bg-gray-50 text-gray-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
};

const ProductIdentifiers: React.FC<{
  /** The variation's identifiers as last read (label codes, saved status). */
  read?: IdentifiersRead | null;
  draft: IdentifiersDraft;
  onChange: (next: IdentifiersDraft) => void;
  /** This variation's SKU: refused as a part number. */
  sku?: string;
  /** Cleaned code to the other SKU of this product that already has it. */
  taken?: Map<string, string>;
  /** The server's refusals of the last save, by row key (`_` = not tied to a row). */
  serverErrors?: RowErrors;
  idPrefix: string;
  disabled?: boolean;
}> = ({ read, draft, onChange, sku, taken, serverErrors, idPrefix, disabled }) => {
  const labels = labelCodesOf(read);
  const errors = draftErrors(draft, { sku, taken, labelValues: labels.map(codeValueOf) });
  const none = draft.exists === false;
  const changed = draftChanged(read, draft);
  const sees = googleSeesLine(read?.effective);
  const hasMpnRow = draft.rows.some((r) => r.type === 'mpn');

  const setRows = (rows: IdentifierRow[]) => onChange({ ...draft, rows });
  const setRow = (key: string, patch: Partial<IdentifierRow>) =>
    setRows(draft.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {sees && (
        <p className={`rounded-md border px-3 py-2 text-xs ${TONE[sees.tone]}`}>
          {sees.text}
          {changed && <span className="block mt-0.5 text-gray-600">Your changes below are not saved yet.</span>}
        </p>
      )}

      <SwitchRow
        id={`${idPrefix}-none`}
        label="This item has no barcode or part number"
        info="Turn this on for an item made in your store, made to order, or from a maker that prints no barcode. Google is then told the item has no identifier."
        checked={none}
        onCheckedChange={(on) => onChange(withNoIdentifier(draft, on))}
        disabled={disabled}
      />

      {none && draft.rows.length > 0 && (
        <p className="text-xs text-amber-700">
          Saving removes the codes below, because the switch says this item has none. Turn the switch off to keep them.
        </p>
      )}

      {draft.rows.length > 0 && (
        <div className="space-y-2">
          {draft.rows.map((row, i) => {
            const e = { ...errors[row.key], ...serverErrors?.[row.key] };
            const showPack = row.type === 'gtin14' || row.packQty.trim() !== '';
            return (
              <div key={row.key} className={none ? 'opacity-50' : undefined}>
                <div className="flex flex-wrap items-start gap-2">
                  <select
                    aria-label={`Code ${i + 1} type`}
                    value={row.type}
                    disabled={disabled || none}
                    onChange={(ev) => setRow(row.key, { type: ev.target.value as IdentifierType })}
                    className={`${fieldInputCls} sm:w-64 w-full`}
                  >
                    {IDENTIFIER_TYPES.map((t) => (
                      <option key={t.value} value={t.value} disabled={t.value === 'mpn' && hasMpnRow && row.type !== 'mpn'}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    id={`${idPrefix}-value-${i}`}
                    aria-label={`Code ${i + 1}`}
                    type="text"
                    value={row.value}
                    disabled={disabled || none}
                    inputMode={row.type === 'mpn' || row.type === 'code128' ? 'text' : 'numeric'}
                    onChange={(ev) => setRow(row.key, { value: ev.target.value })}
                    placeholder={row.type === 'mpn' ? 'As the maker writes it' : row.type === 'code128' ? 'Your own code' : 'Digits under the bars'}
                    className={`${e.value && !none ? fieldInputErrorCls : fieldInputCls} font-mono flex-1 min-w-[10rem]`}
                  />
                  {showPack && (
                    <input
                      aria-label={`Code ${i + 1} packs in the case`}
                      type="number"
                      min={1}
                      step={1}
                      value={row.packQty}
                      disabled={disabled || none}
                      onChange={(ev) => setRow(row.key, { packQty: ev.target.value })}
                      placeholder="Packs in case"
                      title="How many packs this case holds"
                      className={`${e.packQty && !none ? fieldInputErrorCls : fieldInputCls} w-32`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setRows(draft.rows.filter((r) => r.key !== row.key))}
                    disabled={disabled}
                    className="h-9 px-2.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    title="Remove this code"
                    aria-label={`Remove code ${i + 1}`}
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
                {!none && (e.value || e.packQty) && (
                  <p className="text-xs text-red-600 mt-1">{[e.value, e.packQty].filter(Boolean).join(' ')}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setRows([...draft.rows, blankRow()])}
        disabled={disabled || none}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FaPlus size={10} /> Add a barcode or part number
      </button>

      {serverErrors?._?.value && <p className="text-xs text-red-600">{serverErrors._.value}</p>}

      {labels.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs font-medium text-gray-700">Label codes</p>
          <ul className="mt-1 space-y-0.5">
            {labels.map((c, i) => (
              <li key={c.id ?? i} className="text-xs text-gray-600">
                <span className="font-mono text-gray-800">{codeValueOf(c)}</span>
                {' '}{c.is_internal || c.source === 'internal' ? 'Your own shelf code' : typeLabel(c.type ?? c.kind)}
                {c.pack_qty ? `, ${c.pack_qty} in a pack` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-gray-500">
            These are managed in <Link to="/panel/inventory/labels" className="font-medium text-brand-700 hover:underline">Labels and barcodes</Link>.
            They stay as they are when you save here.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProductIdentifiers;
