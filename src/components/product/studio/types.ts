/**
 * Product Page Studio — shared types.
 *
 * ONE editor for everything that appears on a product page below the buy
 * box. It edits TWO existing product columns without changing their storage
 * shape (both storefronts keep reading them as before):
 *
 *   products.aplus_content   — the ordered A+ CONTENT blocks ("Product
 *                              highlights"): banner, image + text, text,
 *                              highlight strip, icon boxes, FAQ, table, video.
 *   products.page_sections   — the page LAYOUT: which sections show, in what
 *                              order, and per-section text overrides
 *                              (description / dosage / FAQs / per-form copy…),
 *                              plus the legacy single-product-template
 *                              sections and custom sections.
 *
 * What is NEW (additive, optional, ignored by older readers): a `display`
 * object on any block or section — heading override, width, background,
 * hide on mobile/desktop, columns, image fit, spacing, which frontends —
 * the "how it should reflect on the frontend" options the owner asked for.
 */

export type Frontend = 'storefront' | 'ecom' | 'template';

export interface DisplaySettings {
  /** Override the heading the page prints for this section/block. */
  heading?: string;
  /** Contained (page width) or edge-to-edge. */
  width?: 'contained' | 'full';
  background?: 'none' | 'soft' | 'brand' | 'dark';
  hideOn?: Array<'mobile' | 'desktop'>;
  /** Start collapsed (accordion) — text-heavy sections. */
  collapsed?: boolean;
  /** Icon / highlight grids. */
  columns?: 2 | 3 | 4;
  imageFit?: 'cover' | 'contain';
  headingSize?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center';
  spacing?: 'compact' | 'normal' | 'spacious';
  /** id for in-page links (#benefits). */
  anchor?: string;
  /** Which frontends render it; absent = all. */
  frontends?: Frontend[];
}

export interface PageSection {
  sectionId: string;
  enabled: boolean;
  order: number;
  customData?: any;
  display?: DisplaySettings;
  /** Editor-only: custom sections carry their own name. */
  name?: string;
}

export type ContentBlock =
  | { type: 'text'; data: { heading?: string; body: string }; display?: DisplaySettings }
  | { type: 'image_text'; data: { heading?: string; body: string; imageUrl: string; imagePosition: 'left' | 'right' }; display?: DisplaySettings }
  | { type: 'icon_box'; items: Array<{ icon: string; title: string; desc: string }>; display?: DisplaySettings }
  | { type: 'faq'; items: Array<{ q: string; a: string }>; display?: DisplaySettings }
  | { type: 'video'; url: string; caption?: string; display?: DisplaySettings }
  | { type: 'highlight_strip'; items: Array<{ icon: string; title?: string; text: string }>; display?: DisplaySettings }
  | { type: 'image' | 'banner'; data: { heading?: string; imageUrl: string; alt?: string }; display?: DisplaySettings }
  | { type: 'comparison_table'; data: { heading?: string; headers: string[]; rows: string[][] }; display?: DisplaySettings }
  | { type: string; [k: string]: any };

/** What the studio row list is made of. */
export type StudioRowId =
  | { kind: 'section'; sectionId: string }
  | { kind: 'block'; index: number }
  | { kind: 'product'; id: string };

export const rowKey = (r: StudioRowId): string =>
  r.kind === 'section' ? `s:${r.sectionId}` : r.kind === 'block' ? `b:${r.index}` : `p:${r.id}`;

export const APLUS_SECTION_ID = 'aplusContent';
