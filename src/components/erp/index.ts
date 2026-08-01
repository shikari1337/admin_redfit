/**
 * ERP primitive kit — the shared design system for the admin's ERP surfaces
 * (panels, POS, scanner, vendor portal, imports, setup). Import from
 * '@/components/erp' so every screen speaks one visual language.
 *
 *   Page, PageHeader     — page shell + header block
 *   Card, SectionCard    — surface cards (one radius/shadow/border)
 *   StatCard, StatGrid   — dashboard KPI tiles
 *   Btn                  — buttons (primary/success/danger/outline/ghost)
 *   StatusChip, Chip     — one status→colour map across all panels
 *   Money, inr, num …    — ₹ formatting, tabular + right-aligned
 *   TableShell, Th, Td … — clean, aligned, sticky-header tables
 *   FilterBar, Field …   — aligned filter/search toolbars
 *   TabBar               — in-page underline tabs
 *   EmptyState           — friendly "nothing here yet"
 */
export { Page, PageHeader } from './Page';
export { Card, SectionCard, CARD } from './Card';
export { StatCard, StatGrid } from './StatCard';
export type { StatTone } from './StatCard';
export { Btn, btn } from './Button';
export type { BtnProps } from './Button';
export { StatusChip, Chip, toneForStatus } from './StatusChip';
export type { Tone } from './StatusChip';
export { Money, inr, inrMinor, num } from './Money';
export {
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from './DataTable';
export { FilterBar, Field, TextInput, SelectInput, SearchInput } from './FilterBar';
export { TabBar } from './Tabs';
export type { TabDef } from './Tabs';
export { EmptyState } from './EmptyState';
// Custom fields engine (§19) — drop-in card any record's detail screen can mount
export { CustomFieldsCard } from './CustomFieldsCard';
export type { CustomFieldEntityType } from './CustomFieldsCard';
// Polymorphic attachments (099) — drop-in "attach files to this record" widget
export { AttachmentPanel } from './AttachmentPanel';

// ── Shared Books/list foundation (export · filter · pagination · drill-through) ──
// One place a build wave imports the whole list toolkit from '@/components/erp'.
export { ExportMenu } from './ExportMenu';
export type { ExportMenuProps, ServerExport } from './ExportMenu';
export { Pagination } from './Pagination';
export { DrillLink } from './DrillLink';
export { BooksToolbar } from './BooksToolbar';
// Client-side CSV path (lib/csv.ts) — re-exported so CSV lives with the kit.
export { toCsv, downloadCsv } from '@/lib/csv';
export type { CsvColumn } from '@/lib/csv';
// List-controls hook (search+status+range+pagination state → axios params).
export { useListControls } from '@/hooks/useListControls';
export type {
  UseListControls, UseListControlsOptions, ListControlsState, ListParams,
} from '@/hooks/useListControls';
