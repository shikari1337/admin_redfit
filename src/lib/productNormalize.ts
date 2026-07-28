/**
 * Load/save-time coercers for product JSONB fields.
 *
 * The live DB holds several eras of shapes (imports, compliance templates, the
 * current editor). The ProductForm editors index straight into
 * `section.items` / `block.data`, so every shape MUST be coerced on load —
 * a single malformed row otherwise crashes the whole edit page.
 *
 * Verified against the live homeomead DB (2026-07-27):
 *   specifications: sections {key?,heading,items:[{key,label,value}]} AND flat
 *                   pairs [{label,value},…] (import era)
 *   aplus_content:  flat {type:'text',title,html} / {type:'video',url} — the
 *                   shape the storefront PDP renders (d = b.data || b).
 */

export interface SpecSection {
  heading: string;
  items: Array<{ key: string; value: string }>;
  [key: string]: any;
}

export function normalizeSpecifications(raw: any): SpecSection[] | undefined {
  let specs = raw;
  if (typeof specs === 'string') { try { specs = JSON.parse(specs); } catch { return undefined; } }
  if (!Array.isArray(specs) || specs.length === 0) return undefined;

  const coerceItem = (it: any) => ({
    ...it,
    key: String(it.key ?? it.name ?? it.label ?? ''),
    value: String(it.value ?? it.val ?? ''),
  });

  const sections: SpecSection[] = [];
  const loosePairs: any[] = [];
  for (const sec of specs) {
    if (!sec || typeof sec !== 'object') continue;
    const rawItems = Array.isArray(sec.items) ? sec.items
      : Array.isArray(sec.rows) ? sec.rows
      : Array.isArray(sec.entries) ? sec.entries
      : Array.isArray(sec.specs) ? sec.specs : null;
    if (rawItems) {
      const items = rawItems.filter((it: any) => it && typeof it === 'object').map(coerceItem);
      sections.push({
        ...sec, // preserve `key` — links a section to its compliance template
        heading: String(sec.heading ?? sec.title ?? sec.name ?? ''),
        items: items.length ? items : [{ key: '', value: '' }],
      });
    } else if (sec.value !== undefined && (sec.label !== undefined || sec.key !== undefined || sec.name !== undefined)) {
      loosePairs.push(coerceItem(sec)); // flat {label,value} pair (import era)
    } else if (sec.heading || sec.title || sec.name) {
      sections.push({ ...sec, heading: String(sec.heading ?? sec.title ?? sec.name ?? ''), items: [{ key: '', value: '' }] });
    }
  }
  if (loosePairs.length) sections.unshift({ heading: 'Specifications', items: loosePairs });
  return sections.length ? sections : undefined;
}

/** Flat DB/storefront blocks → the editor's canonical `data:{…}` shape. */
export function normalizeContentBlocks(raw: any): any[] {
  let blocks = raw;
  if (typeof blocks === 'string') { try { blocks = JSON.parse(blocks); } catch { return []; } }
  if (!Array.isArray(blocks)) return [];
  return blocks
    // Drop non-objects and PDP layout rows ({sectionId, enabled, order}) —
    // a different concept that must never be edited/saved as content blocks.
    .filter((b: any) => b && typeof b === 'object' && typeof b.type === 'string')
    .map((b: any) => {
      const d = b.data || {};
      switch (b.type) {
        case 'text':
          return {
            type: 'text',
            data: {
              heading: String(d.heading ?? b.title ?? b.heading ?? ''),
              body: String(d.body ?? b.html ?? b.body ?? b.text ?? b.content ?? ''),
            },
          };
        case 'image_text':
          return {
            type: 'image_text',
            data: {
              heading: String(d.heading ?? b.title ?? b.heading ?? ''),
              body: String(d.body ?? b.html ?? b.text ?? b.description ?? ''),
              imageUrl: String(d.imageUrl ?? b.imageUrl ?? b.image ?? ''),
              imagePosition: (d.imagePosition ?? b.imagePosition ?? (b.reverse ? 'right' : 'left')) as 'left' | 'right',
            },
          };
        case 'icon_box':
          return {
            type: 'icon_box',
            items: itemsOf(b).map((i: any) => ({ icon: String(i.icon ?? i.imageUrl ?? ''), title: String(i.title ?? i.label ?? ''), desc: String(i.desc ?? i.text ?? '') })),
          };
        case 'highlight_strip':
          return {
            type: 'highlight_strip',
            items: itemsOf(b).map((i: any) => ({ icon: String(i.icon ?? i.imageUrl ?? ''), text: String(i.text ?? i.title ?? '') })),
          };
        case 'faq':
          return {
            type: 'faq',
            items: itemsOf(b).map((i: any) => ({ q: String(i.q ?? i.question ?? ''), a: String(i.a ?? i.answer ?? '') })),
          };
        case 'video':
          return { type: 'video', url: String(b.url ?? d.url ?? ''), caption: String(b.caption ?? d.caption ?? '') };
        default:
          return b; // unknown types pass through untouched (editor shows a label only)
      }
    });
}

const itemsOf = (b: any): any[] =>
  (Array.isArray(b.items) ? b.items : Array.isArray(b.data?.items) ? b.data.items : [])
    .filter((i: any) => i && typeof i === 'object');

/** Mirror of normalizeContentBlocks: editor shape → the flat storefront shape
 *  ({type,title,html}, {type:'video',url}, …) the PDP's AplusContent renders. */
export function serializeContentBlocks(blocks: any[]): any[] {
  const stripHtml = (s: string) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return (blocks || []).map((b: any) => {
    const d = b?.data || {};
    switch (b?.type) {
      case 'text':
        return { type: 'text', title: d.heading || '', html: d.body || '' };
      case 'image_text':
        return {
          type: 'image_text', title: d.heading || '',
          text: stripHtml(d.body), html: d.body || '',
          imageUrl: d.imageUrl || '', imagePosition: d.imagePosition || 'left',
          reverse: d.imagePosition === 'right',
        };
      case 'icon_box':
        return { type: 'icon_box', items: (b.items || []).map((i: any) => ({ icon: i.icon || '', title: i.title || '', desc: i.desc || '', text: i.desc || '' })) };
      case 'highlight_strip':
        return { type: 'highlight_strip', items: (b.items || []).map((i: any) => ({ icon: i.icon || '', text: i.text || '' })) };
      case 'faq':
        return { type: 'faq', items: (b.items || []).map((i: any) => ({ q: i.q || '', a: i.a || '', question: i.q || '', answer: i.a || '' })) };
      case 'video':
        return { type: 'video', url: b.url || '', caption: b.caption || '' };
      default:
        return b;
    }
  }).filter((b: any) => {
    if (!b || typeof b !== 'object') return false;
    if (b.type === 'text') return !!(b.title || b.html);
    if (b.type === 'image_text') return !!(b.title || b.html || b.imageUrl);
    if (b.type === 'video') return !!b.url;
    if (Array.isArray(b.items)) return b.items.length > 0;
    return true;
  });
}
