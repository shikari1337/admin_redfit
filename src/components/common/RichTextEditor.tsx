import React, { useRef, useEffect, useCallback } from 'react';

/**
 * Reusable dependency-free rich-text (WYSIWYG) editor.
 *
 * Outputs HTML via `onChange`. Uses a contentEditable surface with a small
 * formatting toolbar. No external library → no version/peer conflicts and
 * nothing that can break the app theme.
 *
 * Used for product Full Description and A+ content text bodies.
 */
export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
}

type Cmd = { label: string; title: string; run: (exec: (c: string, v?: string) => void) => void };

const TOOLBAR: Cmd[] = [
  { label: 'B', title: 'Bold', run: e => e('bold') },
  { label: 'I', title: 'Italic', run: e => e('italic') },
  { label: 'U', title: 'Underline', run: e => e('underline') },
  { label: 'H2', title: 'Heading', run: e => e('formatBlock', 'H2') },
  { label: 'H3', title: 'Subheading', run: e => e('formatBlock', 'H3') },
  { label: '¶', title: 'Paragraph', run: e => e('formatBlock', 'P') },
  { label: '• List', title: 'Bullet list', run: e => e('insertUnorderedList') },
  { label: '1. List', title: 'Numbered list', run: e => e('insertOrderedList') },
  { label: '“ ”', title: 'Quote', run: e => e('formatBlock', 'BLOCKQUOTE') },
  { label: '🖉', title: 'Link', run: e => { const url = window.prompt('Link URL'); if (url) e('createLink', url); } },
  { label: '⨯', title: 'Clear formatting', run: e => { e('removeFormat'); e('unlink'); } },
];

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value, onChange, placeholder = 'Write here…', minHeight = 160, className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external value → DOM only when it differs and the editor isn't focused
  // (prevents caret jumps while typing).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value && document.activeElement !== el) {
      el.innerHTML = value || '';
    }
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (el) onChange(el.innerHTML === '<br>' ? '' : el.innerHTML);
  }, [onChange]);

  const exec = useCallback((command: string, val?: string) => {
    ref.current?.focus();
    // execCommand is deprecated but still universally supported and dependency-free.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, val);
    emit();
  }, [emit]);

  return (
    <div className={`border border-gray-300 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-red-500 ${className}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
        {TOOLBAR.map((c, i) => (
          <button key={i} type="button" title={c.title}
            onMouseDown={e => { e.preventDefault(); c.run(exec); }}
            className="px-2 py-1 text-xs rounded text-gray-700 hover:bg-gray-200 min-w-[26px]">
            {c.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className="rte-surface px-3 py-2 text-sm text-gray-800 focus:outline-none prose prose-sm max-w-none"
        style={{ minHeight }}
      />
      <style>{`
        .rte-surface:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
        .rte-surface h2 { font-size: 1.15rem; font-weight: 700; margin: .5em 0 .25em; }
        .rte-surface h3 { font-size: 1rem; font-weight: 600; margin: .5em 0 .25em; }
        .rte-surface ul { list-style: disc; padding-left: 1.4em; }
        .rte-surface ol { list-style: decimal; padding-left: 1.4em; }
        .rte-surface blockquote { border-left: 3px solid #e5e7eb; padding-left: .75em; color: #6b7280; margin: .5em 0; }
        .rte-surface a { color: #2563eb; text-decoration: underline; }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
