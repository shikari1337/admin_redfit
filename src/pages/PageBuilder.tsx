/**
 * PageBuilder — full-screen Elementor-style visual editor for CMS pages,
 * powered by GrapesJS (BSD-3-Clause open source, fully self-hosted — this is
 * the OSS library, NOT the commercial "GrapesJS Studio" hosted product).
 *
 * Route: /pages/:id/builder (full-screen, like /themes/:id/customize).
 *
 * What you get: drag-and-drop blocks (sections, columns, text, images, video,
 * forms, custom HTML), a full CSS style manager (typography, dimensions,
 * backgrounds, borders, shadows, flex), layer tree, responsive device preview,
 * HTML/CSS import-export, undo/redo — all client-side.
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
import presetWebpage from 'grapesjs-preset-webpage';
import blocksBasic from 'grapesjs-blocks-basic';
import customCode from 'grapesjs-custom-code';
import { ArrowLeft, Save, ExternalLink, Import } from 'lucide-react';
import { pagesAPI, uploadAPI, categoriesAPI, brandsAPI, attributesAPI } from '../services/api';
import storeBlocks from '../lib/grapesStoreBlocks';
import type { StoreBlocksOpts } from '../lib/grapesStoreBlocks';
import { classicBlocksToHtml } from '../lib/classicBlocksHtml';

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

const PageBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const pageRef = useRef<any>(null);
  const readyRef = useRef(false);

  const [pageTitle, setPageTitle] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [classicCount, setClassicCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !containerRef.current) return;
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

      const blocks: any[] = page?.contentBlocks || page?.sections || [];
      const builderBlock = blocks.find((b) => b?.blockType === 'builder');
      setClassicCount(blocks.filter((b) => b?.blockType && b.blockType !== 'builder').length);

      const editor = grapesjs.init({
        container: containerRef.current,
        height: 'calc(100vh - 52px)',
        width: 'auto',
        storageManager: false,
        noticeOnUnload: false,
        selectorManager: { componentFirst: true },
        plugins: [
          (ed: Editor) => presetWebpage(ed, {
            modalImportTitle: 'Import HTML / CSS',
            modalImportLabel: 'Paste HTML below (styles in a &lt;style&gt; tag are picked up too) and hit Import',
            modalImportContent: (e: Editor) => `${e.getHtml()}<style>${e.getCss()}</style>`,
          }),
          (ed: Editor) => blocksBasic(ed, { flexGrid: true }),
          (ed: Editor) => customCode(ed, {}),
          (ed: Editor) => storeBlocks(ed, lookups),
        ],
        assetManager: {
          // Uploads go through OUR backend (DO Spaces) — never a third party.
          upload: 'custom',
          uploadFile: async (ev: any) => {
            const files: FileList | undefined = ev?.dataTransfer?.files ?? ev?.target?.files;
            for (const file of Array.from(files || [])) {
              try {
                const res: any = await uploadAPI.uploadSingle(file as File, 'pages');
                const url = res?.data?.url || res?.data?.data?.url || res?.url;
                if (url) editorRef.current?.AssetManager.add({ src: url, name: (file as File).name });
              } catch {
                setSaveMsg('Image upload failed');
                setTimeout(() => setSaveMsg(''), 2500);
              }
            }
          },
        },
      });
      editorRef.current = editor;

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
          // The conversion isn't persisted until the user hits Save.
          if (seededFromClassic) setDirty(true);
        }, 0);
      });
      editor.on('update', () => { if (readyRef.current) setDirty(true); });
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
      await pagesAPI.update(id, { contentBlocks: [block] });
      pageRef.current = { ...page, contentBlocks: [block] };
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
      <div className="h-[52px] shrink-0 bg-gray-900 text-white flex items-center gap-3 px-3">
        <Link
          to={`/pages/${id}/edit`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft size={14} /> Exit
        </Link>
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight truncate">
            {pageTitle}
            {dirty && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" title="Unsaved changes" />}
          </p>
          <p className="text-[10.5px] text-gray-400 leading-tight">Visual builder · /{pageSlug}</p>
        </div>
        {classicCount > 0 && (
          <span className="hidden md:flex items-center gap-1.5 text-[10.5px] font-semibold text-sky-300 bg-sky-500/15 px-2.5 py-1 rounded-full">
            <Import size={11} />
            {classicCount} classic block{classicCount !== 1 ? 's' : ''} imported into the canvas — Save converts the page (originals kept as backup)
          </span>
        )}
        <div className="flex-1" />
        {saveMsg && (
          <span className={`text-xs font-semibold ${saveMsg === 'Saved!' ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg}</span>
        )}
        {pageSlug && (
          <a
            href={`${(import.meta as any).env?.VITE_STOREFRONT_URL || 'http://localhost:3000'}/pages/${pageSlug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <ExternalLink size={13} /> View page
          </a>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors"
        >
          {saving ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /> : <Save size={13} />}
          Save
        </button>
      </div>

      {/* GrapesJS mounts here (its own panels: blocks, styles, layers, devices, code) */}
      <div className="flex-1 min-h-0">
        <div ref={containerRef} />
      </div>
    </div>
  );
};

export default PageBuilder;
