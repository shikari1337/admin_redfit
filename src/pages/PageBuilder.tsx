/**
 * PageBuilder — full-screen Elementor-style visual editor for CMS pages,
 * powered by GrapesJS (BSD-3-Clause open source, fully self-hosted — this is
 * the OSS library, NOT the commercial "GrapesJS Studio" hosted product).
 *
 * Route: /pages/:id/builder (full-screen, like /themes/:id/customize).
 *
 * Layout: a persistent left sidebar (Elements / Layers / Edit-selected tabs,
 * `pageBuilderTheme.css` reskins GrapesJS's own blocks/style/trait/layer
 * markup into card-like rows) + canvas, with a custom top toolbar
 * (undo/redo, device switch, outline toggle, preview, code/import) driving
 * GrapesJS commands directly — no default GrapesJS panel chrome is used.
 * Image fields (asset manager) open our own Media Library picker
 * (upload / choose existing / paste URL) instead of GrapesJS's stock UI.
 *
 * Storage: the page's contentBlocks become ONE block —
 *   { blockType: 'builder', data: { html, css, project, replacedBlocks? } }
 * `project` is the GrapesJS project JSON (lossless re-editing); `html`+`css`
 * are the compiled output the storefront renders. Any classic blocks that
 * existed before the first builder save are preserved in `replacedBlocks` so
 * nothing is destroyed. No backend changes: /pages PUT already deep-decodes
 * the global xss-clean escaping (COMMON_MISTAKES #20).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import grapesjs from 'grapesjs';
import type { Editor } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './pageBuilderTheme.css';
import presetWebpage from 'grapesjs-preset-webpage';
import blocksBasic from 'grapesjs-blocks-basic';
import customCode from 'grapesjs-custom-code';
import {
  ArrowLeft, Save, ExternalLink, Import, Undo2, Redo2, Monitor, Tablet, Smartphone,
  Eye, Code2, SquareDashed, LayoutGrid, Layers, Settings2, ChevronLeft, Globe,
} from 'lucide-react';
import { useStore } from '../contexts/StoreContext';
import { pagesAPI, categoriesAPI, brandsAPI, attributesAPI } from '../services/api';
import storeBlocks from '../lib/grapesStoreBlocks';
import type { StoreBlocksOpts } from '../lib/grapesStoreBlocks';
import layoutBlocks from '../lib/grapesLayoutBlocks';
import { STYLE_SECTORS, BUILDER_DEVICES, registerCommonTraits } from '../lib/grapesStyleSectors';
import { classicBlocksToHtml } from '../lib/classicBlocksHtml';
import MediaPicker from '../components/common/MediaPicker';
import PageSeoPanel from '../components/pagebuilder/PageSeoPanel';
import type { PageSeoValue, PageBasics } from '../components/pagebuilder/PageSeoPanel';
import StoreBlockContentPanel, { isEditableStoreBlock } from '../components/pagebuilder/StoreBlockContentPanel';

/** Category/brand/attribute lookups feed the store-block trait dropdowns. */
async function loadLookups(): Promise<StoreBlocksOpts> {
  const [catRes, brandRes, attrRes] = await Promise.all([
    categoriesAPI.list().catch(() => []),
    brandsAPI.list().catch(() => ({ data: [] })),
    attributesAPI.list().catch(() => []),
  ]);
  const cats: any[] = Array.isArray(catRes) ? catRes : (catRes as any)?.data ?? [];
  const brands: any[] = Array.isArray(brandRes) ? brandRes : (brandRes as any)?.data ?? [];
  const attrs: any[] = Array.isArray(attrRes) ? attrRes : (attrRes as any)?.data ?? [];
  return {
    categories: cats.map((c) => ({ id: c.slug, label: c.name || c.slug })),
    brands: brands.map((b) => ({ id: b.slug, label: b.name || b.slug })),
    attributes: attrs.flatMap((a) =>
      (a.values || []).map((v: any) => ({ id: `${a.slug}:${v.slug}`, label: `${a.name}: ${v.name}` }))),
  };
}

const BUILDER_BLOCK_ID = 'visual-builder';

/** GrapesJS exports the wrapper as <body …> — convert to a div so the
 *  storefront can inject it, keeping wrapper attributes (id/classes) intact. */
function bodyToDiv(html: string): string {
  return html.replace(/^\s*<body([^>]*)>/i, '<div$1>').replace(/<\/body>\s*$/i, '</div>');
}

type SidebarMode = 'blocks' | 'layers' | 'edit' | 'page';
type EditTab = 'content' | 'style';
type Device = 'desktop' | 'tablet' | 'mobile';

const PageBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // The SERP preview shows the real "… | StoreName" suffix, so it needs the
  // store's actual name — already resolved by StoreContext, no extra fetch.
  const { currentStore } = useStore();
  const storeName = currentStore?.storeName || 'Store';
  const containerRef = useRef<HTMLDivElement>(null);
  const blocksElRef = useRef<HTMLDivElement>(null);
  const layersElRef = useRef<HTMLDivElement>(null);
  const traitElRef = useRef<HTMLDivElement>(null);
  const styleElRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const pageRef = useRef<any>(null);
  const readyRef = useRef(false);
  /**
   * Did the author actually touch the CANVAS, as opposed to only the Page/SEO
   * form? Saving the canvas rewrites the page's content into one `builder`
   * block — which, on a page still made of classic blocks (the homepage, most
   * importantly), is a real conversion. Someone who opened the builder purely
   * to set a meta description must not trigger that as a side effect, so the
   * two are tracked separately and the save writes only what changed.
   */
  const canvasDirtyRef = useRef(false);

  const [pageTitle, setPageTitle] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  // Page settings + SEO, edited in the sidebar's Page tab and saved with the
  // same Save button as the canvas — an author shouldn't have to leave the
  // builder (or visit a different screen entirely) to set a page's title or
  // how it appears in Google.
  const [basics, setBasics] = useState<PageBasics>({ title: '', slug: '', isActive: true });
  const [seo, setSeo] = useState<PageSeoValue>({});
  const [isHomepage, setIsHomepage] = useState(false);
  const [classicCount, setClassicCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  // Sidebar navigation state (Elementor-style: Elements / Layers / Edit-selected).
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('blocks');
  const [editTab, setEditTab] = useState<EditTab>('content');
  const [selectedLabel, setSelectedLabel] = useState('');
  // The selected component, when it's a LIVE section whose content is editable
  // through the shared homepage schema (hero slides, trust badges, …) rather
  // than through flat GrapesJS traits.
  const [storeBlock, setStoreBlock] = useState<{ component: any; kind: string } | null>(null);
  const [storeBlockRev, setStoreBlockRev] = useState(0);
  const [blockSearch, setBlockSearch] = useState('');
  const [sidebarHidden, setSidebarHidden] = useState(false);

  // Toolbar toggle state (mirrors GrapesJS's own Commands.isActive).
  const [outlineOn, setOutlineOn] = useState(false);
  const [device, setDevice] = useState<Device>('desktop');

  // Our own Media Library modal stands in for GrapesJS's stock asset manager.
  const [assetCtx, setAssetCtx] = useState<any>(null);

  useEffect(() => {
    if (!id || !containerRef.current || !blocksElRef.current || !layersElRef.current
      || !traitElRef.current || !styleElRef.current) return;
    let disposed = false;

    (async () => {
      let page: any = null;
      let lookups: StoreBlocksOpts = {};
      try {
        const [res, lk] = await Promise.all([pagesAPI.getById(id), loadLookups()]);
        page = (res as any)?.data ?? res;
        lookups = lk;
      } catch {
        if (!disposed) setError('Could not load this page.');
        return;
      }
      if (disposed || !containerRef.current) return;
      pageRef.current = page;
      setPageTitle(page?.title || 'Untitled page');
      setPageSlug(page?.slug || '');
      setBasics({
        title: page?.title || '',
        slug: page?.slug || '',
        isActive: page?.isActive ?? page?.is_active ?? true,
      });
      setSeo((page?.seo && typeof page.seo === 'object') ? page.seo : {});
      setIsHomepage((page?.type ?? page?.pageType) === 'homepage' || page?.slug === 'home');

      const blocks: any[] = page?.contentBlocks || page?.sections || [];
      const builderBlock = blocks.find((b) => b?.blockType === 'builder');
      setClassicCount(blocks.filter((b) => b?.blockType && b.blockType !== 'builder').length);

      const editor = grapesjs.init({
        container: containerRef.current,
        height: '100%',
        width: 'auto',
        storageManager: false,
        noticeOnUnload: false,
        panels: { defaults: [] }, // fully custom top toolbar (below) drives GrapesJS commands directly
        blockManager: { appendTo: blocksElRef.current! },
        layerManager: { appendTo: layersElRef.current! },
        traitManager: { appendTo: traitElRef.current! },
        selectorManager: { appendTo: styleElRef.current!, componentFirst: true },
        // Flex/grid/gap/object-fit/filters, grouped the way someone laying out a
        // page thinks — the stock sectors can't even centre a row (see
        // lib/grapesStyleSectors.ts).
        styleManager: { appendTo: styleElRef.current!, sectors: STYLE_SECTORS as any },
        // Breakpoints match the storefront's own, so "looks right on tablet"
        // here means the same thing there. Non-desktop edits are written into
        // that device's media query, which the save-time sanitizer preserves.
        deviceManager: { devices: BUILDER_DEVICES as any },
        plugins: [
          (ed: Editor) => presetWebpage(ed, {
            modalImportTitle: 'Import HTML / CSS',
            modalImportLabel: 'Paste HTML below (styles in a &lt;style&gt; tag are picked up too) and hit Import',
            modalImportContent: (e: Editor) => `${e.getHtml()}<style>${e.getCss()}</style>`,
          }),
          (ed: Editor) => blocksBasic(ed, { flexGrid: true }),
          (ed: Editor) => customCode(ed, {}),
          (ed: Editor) => storeBlocks(ed, lookups),
          (ed: Editor) => layoutBlocks(ed),
          (ed: Editor) => registerCommonTraits(ed),
        ],
        assetManager: {
          // Fully custom UI (below) — Media Library / Upload / URL — replaces
          // GrapesJS's stock asset modal for every image field & background picker.
          custom: true,
        },
      });
      editorRef.current = editor;

      editor.on('asset:custom', (data: any) => setAssetCtx(data?.open ? data : null));
      editor.on('component:selected', (component: any) => {
        setSelectedLabel(component?.getName?.() || 'Element');
        const kind = isEditableStoreBlock(component);
        setStoreBlock(kind ? { component, kind } : null);
        setStoreBlockRev((r) => r + 1);
        setSidebarMode('edit');
        setEditTab('content');
      });
      editor.on('component:deselected', () => {
        setSelectedLabel('');
        setStoreBlock(null);
        setSidebarMode((m) => (m === 'edit' ? 'blocks' : m));
      });

      editor.on('load', () => {
        // Re-open losslessly from the saved project; fall back to compiled
        // html/css; a CLASSIC page gets its blocks CONVERTED into the canvas
        // so the existing content is visible and editable (dynamic blocks
        // become live store-block placeholders).
        let seededFromClassic = false;
        if (builderBlock?.data?.project) {
          editor.loadProjectData(builderBlock.data.project);
        } else if (builderBlock?.data?.html) {
          editor.setComponents(String(builderBlock.data.html));
          editor.setStyle(String(builderBlock.data.css || ''));
        } else {
          const classic = blocks.filter((b) => b?.blockType && b.blockType !== 'builder');
          if (classic.length) {
            const converted = classicBlocksToHtml(classic);
            editor.setComponents(converted.html);
            editor.setStyle(converted.css);
            seededFromClassic = true;
          }
        }
        setTimeout(() => {
          readyRef.current = true;
          // Deliberately NOT marked dirty when seeded from classic blocks: the
          // conversion now only happens if the author actually edits the canvas
          // (canvasDirtyRef), so flagging unsaved changes on mere page load
          // would be claiming a pending write that isn't there.
          void seededFromClassic;
        }, 0);
      });
      editor.on('update', () => {
        if (!readyRef.current) return;
        canvasDirtyRef.current = true;
        setDirty(true);
      });
    })();

    return () => {
      disposed = true;
      readyRef.current = false;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [id]);

  async function handleSave() {
    const editor = editorRef.current;
    if (!editor || !id) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const page = pageRef.current || {};
      const blocks: any[] = page?.contentBlocks || page?.sections || [];
      const existingBuilder = blocks.find((b) => b?.blockType === 'builder');
      // Classic blocks are preserved inside the builder block, not destroyed.
      const replacedBlocks =
        existingBuilder?.data?.replacedBlocks
        ?? blocks.filter((b) => b?.blockType && b.blockType !== 'builder');

      const block = {
        blockId: BUILDER_BLOCK_ID,
        blockType: 'builder',
        enabled: true,
        order: 0,
        data: {
          html: bodyToDiv(editor.getHtml()),
          css: editor.getCss() || '',
          project: editor.getProjectData(),
          ...(replacedBlocks.length ? { replacedBlocks } : {}),
        },
      };
      // Page settings + SEO ride the SAME save as the canvas — one Save button
      // for everything on screen, so a title change can't be silently lost by
      // an author who only thinks of Save as "save the layout". The slug is
      // never sent for the homepage: its `home` slug is what /pages/slug/home
      // resolves, and letting it be renamed would take the storefront homepage
      // offline.
      const payload: Record<string, any> = {
        title: basics.title.trim() || pageTitle,
        isActive: basics.isActive,
        seo,
        ...(isHomepage || !basics.slug.trim() ? {} : { slug: basics.slug.trim() }),
        // Content is written ONLY when the canvas was actually edited — see
        // canvasDirtyRef. A settings-only save leaves the page's existing
        // blocks exactly as they are.
        ...(canvasDirtyRef.current ? { contentBlocks: [block] } : {}),
      };
      await pagesAPI.update(id, payload);
      pageRef.current = { ...page, ...payload };
      setPageTitle(payload.title);
      if (payload.slug) setPageSlug(payload.slug);
      if (canvasDirtyRef.current) {
        canvasDirtyRef.current = false;
        setClassicCount(0); // the conversion just happened; the notice no longer applies
      }
      setDirty(false);
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e: any) {
      setSaveMsg(e?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Warn about losing unsaved work on tab close.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function handleBlockSearch(q: string) {
    setBlockSearch(q);
    const editor = editorRef.current;
    if (!editor) return;
    const bm = editor.BlockManager;
    if (!q.trim()) { bm.render(); return; }
    const needle = q.trim().toLowerCase();
    const filtered = (bm.getAll() as any).filter((b: any) => String(b.get('label') || '').toLowerCase().includes(needle));
    bm.render(filtered);
  }

  function toggleOutline() {
    const editor = editorRef.current;
    if (!editor) return;
    if (outlineOn) editor.stopCommand('core:component-outline'); else editor.runCommand('core:component-outline');
    setOutlineOn((v) => !v);
  }

  function setDeviceMode(d: Device) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.runCommand(`set-device-${d}`);
    setDevice(d);
  }

  function backToBlocks() {
    editorRef.current?.select();
    setSidebarMode('blocks');
  }

  // Any GrapesJS asset field (image src, background-image, …) routes here
  // instead of the stock asset manager UI.
  function handleAssetSelect(url: string) {
    const editor = editorRef.current;
    if (!editor || !assetCtx) return;
    let asset = editor.AssetManager.get(url);
    if (!asset) {
      const added: any = editor.AssetManager.add({ src: url });
      asset = Array.isArray(added) ? added[0] : added;
    }
    assetCtx.select(asset, true);
    assetCtx.close();
    setAssetCtx(null);
  }

  function handleAssetModalClose() {
    assetCtx?.close();
    setAssetCtx(null);
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 text-gray-500">
        <p className="text-sm">{error}</p>
        <Link to="/appearance/pages" className="text-sm font-semibold text-blue-600 hover:underline">← Back to Pages</Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Top bar */}
      <div className="h-[52px] shrink-0 bg-gray-900 text-white flex items-center gap-2 px-3">
        <Link
          to={`/pages/${id}/edit`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
        >
          <ArrowLeft size={14} /> Exit
        </Link>
        <div className="min-w-0 shrink-0 max-w-[220px]">
          <p className="text-[13px] font-bold leading-tight truncate">
            {pageTitle}
            {dirty && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" title="Unsaved changes" />}
          </p>
          <p className="text-[10.5px] text-gray-400 leading-tight">Visual builder · /{pageSlug}</p>
        </div>
        {classicCount > 0 && (
          <span className="hidden md:flex items-center gap-1.5 text-[10.5px] font-semibold text-sky-300 bg-sky-500/15 px-2.5 py-1 rounded-full shrink-0">
            <Import size={11} />
            {classicCount} classic block{classicCount !== 1 ? 's' : ''} shown in the canvas — editing then saving converts the page (originals kept as backup). Page &amp; SEO changes save on their own.
          </span>
        )}

        {/* Editor toolbar: undo/redo · device switch · outline · preview · code/import */}
        <div className="hidden lg:flex items-center gap-0.5 mx-1">
          <button type="button" className="pb-topbtn" title="Undo" onClick={() => editorRef.current?.runCommand('core:undo')}><Undo2 size={14} /></button>
          <button type="button" className="pb-topbtn" title="Redo" onClick={() => editorRef.current?.runCommand('core:redo')}><Redo2 size={14} /></button>
          <span className="pb-topdivider" />
          <button type="button" className={`pb-topbtn ${device === 'desktop' ? 'active' : ''}`} title="Desktop preview" onClick={() => setDeviceMode('desktop')}><Monitor size={14} /></button>
          <button type="button" className={`pb-topbtn ${device === 'tablet' ? 'active' : ''}`} title="Tablet preview" onClick={() => setDeviceMode('tablet')}><Tablet size={14} /></button>
          <button type="button" className={`pb-topbtn ${device === 'mobile' ? 'active' : ''}`} title="Mobile preview" onClick={() => setDeviceMode('mobile')}><Smartphone size={14} /></button>
          <span className="pb-topdivider" />
          <button type="button" className={`pb-topbtn ${outlineOn ? 'active' : ''}`} title="Toggle element outlines" onClick={toggleOutline}><SquareDashed size={14} /></button>
          <button type="button" className={`pb-topbtn ${sidebarHidden ? 'active' : ''}`} title="Preview (hide panel)" onClick={() => setSidebarHidden((v) => !v)}><Eye size={14} /></button>
          <span className="pb-topdivider" />
          <button type="button" className="pb-topbtn" title="View HTML / CSS" onClick={() => editorRef.current?.runCommand('export-template')}><Code2 size={14} /></button>
        </div>

        <div className="flex-1" />
        {saveMsg && (
          <span className={`text-xs font-semibold ${saveMsg === 'Saved!' ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg}</span>
        )}
        {pageSlug && (
          <a
            href={`${(import.meta as any).env?.VITE_STOREFRONT_URL || 'http://localhost:3000'}/pages/${pageSlug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
          >
            <ExternalLink size={13} /> View page
          </a>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
        >
          {saving ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /> : <Save size={13} />}
          Save
        </button>
      </div>

      {/* Sidebar + canvas */}
      <div className="pb-shell flex-1 min-h-0 flex">
        {/* The Page & SEO form needs more room than the block palette — a SERP
            preview at 300px is unreadable, which is the whole point of it. */}
        <div className={`pb-sidebar ${sidebarMode === 'page' ? 'w-[380px]' : 'w-[300px]'} shrink-0 flex-col overflow-hidden transition-[width] duration-150 ${sidebarHidden ? 'hidden' : 'flex'}`}>
          <div className="pb-sidebar-tabs">
            <div className={`pb-sidebar-tab ${sidebarMode === 'blocks' ? 'active' : ''}`} onClick={() => setSidebarMode('blocks')}>
              <LayoutGrid size={13} /> Elements
            </div>
            <div className={`pb-sidebar-tab ${sidebarMode === 'layers' ? 'active' : ''}`} onClick={() => setSidebarMode('layers')}>
              <Layers size={13} /> Layers
            </div>
            <div className={`pb-sidebar-tab ${sidebarMode === 'page' ? 'active' : ''}`} onClick={() => setSidebarMode('page')}
              title="Page settings & SEO">
              <Globe size={13} /> SEO
            </div>
            {selectedLabel && (
              <div className={`pb-sidebar-tab ${sidebarMode === 'edit' ? 'active' : ''}`} onClick={() => setSidebarMode('edit')}>
                <Settings2 size={13} /> Edit
              </div>
            )}
          </div>

          {/* Elements — drag blocks onto the canvas */}
          <div className={`pb-panel ${sidebarMode === 'blocks' ? '' : 'pb-hidden'}`}>
            <div className="pb-panel-search">
              <input
                type="text"
                value={blockSearch}
                onChange={(e) => handleBlockSearch(e.target.value)}
                placeholder="Search elements…"
              />
            </div>
            <div className="pb-panel-scroll"><div ref={blocksElRef} /></div>
          </div>

          {/* Layers — the component tree (drag to reorder/nest) */}
          <div className={`pb-panel ${sidebarMode === 'layers' ? '' : 'pb-hidden'}`}>
            <div className="pb-panel-scroll"><div ref={layersElRef} /></div>
          </div>

          {/* Page & SEO — title/slug/visibility + everything the storefront's
              generateMetadata reads. Light-on-dark by design: it's a form, not
              a canvas tool, and form fields need form contrast. */}
          <div className={`pb-panel ${sidebarMode === 'page' ? '' : 'pb-hidden'}`}>
            <div className="pb-panel-scroll">
              <PageSeoPanel
                basics={basics}
                seo={seo}
                isHomepage={isHomepage}
                storeName={storeName}
                storefrontUrl={(import.meta as any).env?.VITE_STOREFRONT_URL || 'http://localhost:3000'}
                onChange={({ basics: b, seo: s }) => { setBasics(b); setSeo(s); setDirty(true); }}
              />
            </div>
          </div>

          {/* Edit — the selected element's Content / Style */}
          <div className={`pb-panel ${sidebarMode === 'edit' ? '' : 'pb-hidden'}`}>
            <div className="pb-edit-header">
              <button type="button" onClick={backToBlocks} title="Back to Elements"><ChevronLeft size={15} /></button>
              <span>{selectedLabel || 'Element'}</span>
            </div>
            <div className="pb-edit-tabs">
              <div className={`pb-edit-tab ${editTab === 'content' ? 'active' : ''}`} onClick={() => setEditTab('content')}>Content</div>
              <div className={`pb-edit-tab ${editTab === 'style' ? 'active' : ''}`} onClick={() => setEditTab('style')}>Style</div>
            </div>
            <div className={`pb-panel-scroll ${editTab === 'content' ? '' : 'pb-hidden'}`}>
              {/* A live section's real content (slides, badges, headings) —
                  GrapesJS traits can't express a list, so the shared homepage
                  schema editor is used instead. The trait manager below still
                  renders for ordinary elements. */}
              {storeBlock && (
                <StoreBlockContentPanel
                  component={storeBlock.component}
                  kind={storeBlock.kind}
                  revision={storeBlockRev}
                  onEdited={() => { canvasDirtyRef.current = true; setDirty(true); }}
                />
              )}
              <div ref={traitElRef} className={storeBlock ? 'pb-hidden' : ''} />
              {!selectedLabel && <p className="pb-empty-hint">Select an element on the canvas to edit its content.</p>}
            </div>
            <div className={`pb-panel-scroll ${editTab === 'style' ? '' : 'pb-hidden'}`}>
              <div id="pb-style-mount" ref={styleElRef} />
            </div>
          </div>
        </div>

        {/* Canvas — GrapesJS mounts its iframe here (panels: [] → no stock chrome) */}
        <div className="pb-canvas-wrap flex-1 min-h-0">
          <div ref={containerRef} className="h-full" />
        </div>
      </div>

      {/* Media Library — replaces GrapesJS's stock asset manager for every image field */}
      {assetCtx && (
        <MediaPicker open onClose={handleAssetModalClose} onSelect={handleAssetSelect} folder="pages" />
      )}
    </div>
  );
};

export default PageBuilder;
