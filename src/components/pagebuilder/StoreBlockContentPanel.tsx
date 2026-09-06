/**
 * Content editor for a LIVE section selected in the visual builder.
 *
 * GrapesJS traits are flat key/value inputs, so a section whose content is a
 * LIST — the hero carousel's slides, a trust bar's badges — had nothing to edit
 * with: selecting the carousel offered "Slides from" and "Banner location" and
 * no way to reach the 16 slides themselves. Choosing where the content comes
 * from while being unable to change the content is a dead end.
 *
 * So the builder reuses the SAME schema-driven editor the classic page form
 * uses (`HomepageBlockEditor` + `HOMEPAGE_SCHEMAS`) — image pickers, add/remove/
 * reorder, real field labels — reading and writing the component's `data-*`
 * attributes. One editor for both surfaces means they cannot drift, and every
 * field the storefront component reads is editable from either place.
 */
import React, { useMemo } from 'react';
import type { Component } from 'grapesjs';
import HomepageBlockEditor, { HOMEPAGE_SCHEMAS } from '../pages/HomepageBlockEditors';

/** Structured values travel base64-encoded (`b64:` prefix) because the pages
 *  routes reverse xss-clean's escaping and would shred raw JSON's quotes inside
 *  an attribute — see `lib/classicBlocksHtml.ts`. */
const encodeStructured = (v: any): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `b64:${btoa(bin)}`;
};

const decodeStructured = (raw: string): any => {
  try {
    const bin = atob(raw.slice(4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { return null; }
};

const attrToKey = (name: string) => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const keyToAttr = (key: string) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** The component's data-* attributes → the block `data` shape the schema edits. */
function readBlockData(component: Component): Record<string, any> {
  const attrs = component.getAttributes() as Record<string, any>;
  const out: Record<string, any> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (!name.startsWith('data-') || name === 'data-store-block') continue;
    const raw = String(value ?? '');
    const key = attrToKey(name);
    if (raw.startsWith('b64:')) {
      const parsed = decodeStructured(raw);
      if (parsed !== null) { out[key] = parsed; continue; }
    }
    out[key] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}

export function isEditableStoreBlock(component: Component | null | undefined): string | null {
  const kind = component?.getAttributes?.()?.['data-store-block'];
  return kind && HOMEPAGE_SCHEMAS[String(kind)] ? String(kind) : null;
}

const StoreBlockContentPanel: React.FC<{
  component: Component;
  kind: string;
  /** Bumped by the caller on selection change so the editor re-reads attributes. */
  revision: number;
  onEdited: () => void;
}> = ({ component, kind, revision, onEdited }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => readBlockData(component), [component, revision]);

  const apply = (next: Record<string, any>) => {
    const patch: Record<string, any> = {};
    for (const [key, value] of Object.entries(next)) {
      patch[keyToAttr(key)] = (value !== null && typeof value === 'object')
        ? encodeStructured(value)
        : (value === undefined || value === null ? '' : String(value));
    }
    // Writing attributes re-renders the component's live preview (its view
    // listens on `change:attributes`) and marks the canvas dirty, so Save
    // persists it like any other canvas edit.
    component.addAttributes(patch);
    onEdited();
  };

  return (
    <div className="px-3 py-3 bg-white">
      <p className="text-[11px] text-slate-500 mb-3 leading-snug">
        This section pulls live data from your store. Everything below is saved with the page.
      </p>
      <HomepageBlockEditor blockType={kind} data={data} onChange={apply} />
    </div>
  );
};

export default StoreBlockContentPanel;
