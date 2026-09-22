/**
 * Plain words for the stock ledger's movement types — ONE table shared by the
 * Update-stock dialog (what an action will be recorded as) and the SKU drawer's
 * ledger chain (what each entry was recorded as), so the two can never describe
 * the same movement differently. The keys are the database's own vocabulary
 * (migration 023's CHECK on stock_ledger_entries.movement_type).
 */
export const MOVEMENT_LABELS: Record<string, string> = {
  opening_balance: 'Opening balance',
  purchase_receipt: 'Received (purchase)',
  sales_issue: 'Sold',
  transfer_out: 'Moved out',
  transfer_in: 'Moved in',
  adjustment: 'Adjustment',
  sales_return: 'Customer return',
  purchase_return: 'Returned to supplier',
  cycle_count_correction: 'Count correction',
  damage: 'Damaged',
  expiry_write_off: 'Expired — written off',
  rto_receipt: 'Came back undelivered (RTO)',
};

export const movementLabel = (t?: string | null): string =>
  (t && MOVEMENT_LABELS[t]) || String(t ?? '').replace(/_/g, ' ') || '—';

/** What the source-document code on a ledger entry means. */
export const REF_DOC_LABELS: Record<string, string> = {
  admin: 'Inventory page',
  cutover_023: 'Opening balance (ledger start)',
  payment: 'Order paid',
  pos_bill: 'POS bill',
  batch_count: 'Lot count',
  manual_batch: 'Lot received',
  order: 'Order',
  putaway: 'Put away',
  bin_move: 'Bin move',
  pick: 'Picked',
  grn: 'Goods receipt',
  import: 'Sheet import',
  inventory_import: 'Sheet import',
  batch_import: 'Batch sheet',
  pos: 'POS bill',
  cycle_count: 'Cycle count',
  transfer: 'Transfer',
  return: 'Return',
};

export const refDocLabel = (t?: string | null): string =>
  (t && REF_DOC_LABELS[t]) || String(t ?? '').replace(/_/g, ' ') || '—';

/** First few characters of a hash — enough to eyeball a link, never the whole thing. */
export const shortHash = (h?: string | null): string => (h ? h.slice(0, 8) : '—');
