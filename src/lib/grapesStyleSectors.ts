/**
 * Style Manager sectors for the visual page builder.
 *
 * GrapesJS's stock sectors (General / Dimension / Typography / Decorations /
 * Extra) are a thin default: no flex or grid controls, no gap, no object-fit,
 * no filters, and spacing buried under a sector named "Dimension". Authors hit
 * that ceiling immediately — you cannot centre a row of cards with it.
 *
 * These sectors are organised the way someone laying out a page thinks
 * (Layout → Spacing → Size → Typography → Background → Border → Effects)
 * rather than by CSS spec grouping, and every property here is one the
 * storefront can actually honour: the builder's exported stylesheet is rendered
 * verbatim (scoped to `.gjs-built`, sanitized by `utils/htmlSanitizer`, which
 * deliberately preserves @media so per-device edits survive).
 *
 * Property entries are plain CSS names wherever GrapesJS already ships a good
 * built-in control for them; explicit objects only where it doesn't, so we
 * inherit its colour pickers / composite (box) inputs / unit handling instead of
 * re-declaring — and can't drift from them.
 */
import type { Editor } from 'grapesjs';

const sel = (property: string, label: string, values: string[], def = '') => ({
  property,
  name: label,
  type: 'select' as const,
  default: def,
  options: [{ id: '', label: '— unset —' }, ...values.map((v) => ({ id: v, label: v }))],
});

const num = (property: string, label: string, units: string[], def = '') => ({
  property,
  name: label,
  type: 'number' as const,
  units,
  default: def,
});

export const STYLE_SECTORS = [
  {
    name: 'Layout',
    open: true,
    // Flex is what actually gets used to lay a section out; putting it first
    // (and open) is the difference between "the builder can't centre things"
    // and a two-click answer.
    properties: [
      'display',
      sel('flex-direction', 'Direction', ['row', 'row-reverse', 'column', 'column-reverse']),
      sel('justify-content', 'Justify (main axis)', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']),
      sel('align-items', 'Align (cross axis)', ['stretch', 'flex-start', 'center', 'flex-end', 'baseline']),
      sel('flex-wrap', 'Wrap', ['nowrap', 'wrap', 'wrap-reverse']),
      num('gap', 'Gap', ['px', 'rem', '%']),
      { property: 'grid-template-columns', name: 'Grid columns', type: 'text', default: '' },
      'position', 'top', 'right', 'bottom', 'left',
      { property: 'z-index', name: 'Z-index', type: 'number', default: '' },
      sel('overflow', 'Overflow', ['visible', 'hidden', 'auto', 'scroll']),
    ],
  },
  {
    name: 'Spacing',
    open: false,
    properties: ['margin', 'padding'],
  },
  {
    name: 'Size',
    open: false,
    properties: [
      'width', 'height', 'max-width', 'min-height',
      num('min-width', 'Min width', ['px', '%', 'vw']),
      num('max-height', 'Max height', ['px', '%', 'vh']),
      { property: 'aspect-ratio', name: 'Aspect ratio', type: 'text', default: '' },
      sel('object-fit', 'Image fit', ['fill', 'contain', 'cover', 'none', 'scale-down']),
      sel('object-position', 'Image position', ['center', 'top', 'bottom', 'left', 'right']),
    ],
  },
  {
    name: 'Typography',
    open: false,
    properties: [
      // Deliberately NOT offering Google Fonts: the exported CSS is injected
      // into the storefront, which loads its own font files. Naming a family the
      // storefront never fetches renders as a silent fallback, which looks like
      // the builder ignoring the setting. "Theme font" = inherit.
      {
        property: 'font-family', name: 'Font', type: 'select', default: 'inherit',
        options: [
          { id: 'inherit', label: 'Theme font' },
          { id: 'Georgia, serif', label: 'Serif' },
          { id: 'system-ui, -apple-system, sans-serif', label: 'System sans' },
          { id: 'ui-monospace, SFMono-Regular, Menlo, monospace', label: 'Monospace' },
        ],
      },
      'font-size', 'font-weight', 'letter-spacing', 'line-height', 'color',
      'text-align', 'text-decoration', 'text-shadow',
      sel('text-transform', 'Capitalisation', ['none', 'uppercase', 'lowercase', 'capitalize']),
      sel('white-space', 'Wrapping', ['normal', 'nowrap', 'pre-wrap']),
    ],
  },
  {
    name: 'Background',
    open: false,
    properties: [
      'background-color',
      // `background-image` is GrapesJS's stack/file type — its "add image"
      // button routes through the Asset Manager, which this builder replaces
      // with the store's Media Library (upload + pick existing + paste URL).
      'background-image',
      sel('background-size', 'Size', ['auto', 'cover', 'contain']),
      sel('background-repeat', 'Repeat', ['no-repeat', 'repeat', 'repeat-x', 'repeat-y']),
      sel('background-position', 'Position', ['center center', 'top center', 'bottom center', 'left center', 'right center']),
      sel('background-attachment', 'Attachment', ['scroll', 'fixed', 'local']),
    ],
  },
  {
    name: 'Border & corners',
    open: false,
    properties: ['border-radius', 'border', 'box-shadow'],
  },
  {
    name: 'Effects',
    open: false,
    properties: [
      'opacity', 'transition', 'transform',
      { property: 'filter', name: 'Filter', type: 'text', default: '' },
      { property: 'backdrop-filter', name: 'Backdrop filter', type: 'text', default: '' },
      sel('mix-blend-mode', 'Blend mode', ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']),
      sel('cursor', 'Cursor', ['auto', 'pointer', 'default', 'not-allowed', 'grab']),
      sel('pointer-events', 'Pointer events', ['auto', 'none']),
    ],
  },
];

/**
 * Devices the responsive switcher offers. GrapesJS writes each non-desktop
 * edit into that device's media query, which the sanitizer preserves, so
 * per-breakpoint styling survives all the way to the storefront.
 *
 * Widths match the storefront's own Tailwind breakpoints rather than GrapesJS's
 * defaults, so "looks right on tablet here" means the same thing there.
 */
export const BUILDER_DEVICES = [
  { id: 'desktop', name: 'Desktop', width: '' },
  { id: 'tablet', name: 'Tablet', width: '768px', widthMedia: '1024px' },
  { id: 'mobile', name: 'Mobile', width: '375px', widthMedia: '767px' },
];

/**
 * Traits every element gets, on top of whatever its own type declares.
 *
 * `id` and `title` were the stock pair; the useful additions are the ones that
 * change what the element DOES rather than how it looks — link target, alt text,
 * and a visibility toggle per breakpoint, which authors otherwise have to fake
 * with custom CSS.
 */
export function registerCommonTraits(editor: Editor) {
  const dc = editor.DomComponents;

  // Link: open in a new tab is a per-link decision, not a CSS one.
  const linkType = dc.getType('link');
  if (linkType) {
    const model: any = linkType.model;
    const existing = model?.prototype?.defaults?.traits ?? [];
    dc.addType('link', {
      model: {
        defaults: {
          traits: [
            ...existing.filter((t: any) => (t?.name ?? t) !== 'target'),
            { type: 'text', name: 'href', label: 'Link URL' },
            {
              type: 'select', name: 'target', label: 'Opens in',
              options: [
                { id: '', label: 'Same tab' },
                { id: '_blank', label: 'New tab' },
              ],
            },
            { type: 'text', name: 'title', label: 'Tooltip' },
          ],
        },
      },
    });
  }

  // Image: alt text is an accessibility + SEO field that the stock image trait
  // set doesn't surface prominently, and lazy-loading below-the-fold images is
  // the single cheapest page-speed win available in a page builder.
  dc.addType('image', {
    model: {
      defaults: {
        traits: [
          { type: 'text', name: 'alt', label: 'Alt text (describes the image)' },
          { type: 'text', name: 'title', label: 'Tooltip' },
          {
            type: 'select', name: 'loading', label: 'Loading',
            options: [
              { id: 'lazy', label: 'Lazy (recommended below the fold)' },
              { id: 'eager', label: 'Eager (above the fold)' },
            ],
          },
        ],
        attributes: { loading: 'lazy' },
      },
    },
  });
}
