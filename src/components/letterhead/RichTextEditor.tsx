import { useEffect, useRef, useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Eraser,
  Undo2,
  Redo2,
  Table2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Smaller toolbar (B/I/U/lists) for Additional Info and similar fields. */
  compact?: boolean;
}

type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
  block: string;
};

const EMPTY_ACTIVE: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  unorderedList: false,
  orderedList: false,
  justifyLeft: false,
  justifyCenter: false,
  justifyRight: false,
  block: '',
};

/**
 * Minimal contenteditable rich text editor used by the Letterhead Documents
 * builder. We intentionally avoid pulling in a heavy editor library (TipTap /
 * Lexical / Quill) — this gives us bold/italic/lists/alignment/links plus
 * headings, which covers the vast majority of letterhead body content.
 *
 * Caveats:
 *   - We use `document.execCommand` which is deprecated but still works in
 *     every shipping browser. If a future browser drops it we can swap to
 *     TipTap without changing the prop surface.
 *   - We only emit `onChange` when the user actually edits — programmatic
 *     setValue calls don't cause an extra event.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing…',
  minHeight = 160,
  compact = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // Tracks the last value we either accepted from props or emitted ourselves;
  // prevents the React render loop from blowing away the user's caret while typing.
  const lastEmittedRef = useRef<string>('');
  const [active, setActive] = useState<ActiveFormats>(EMPTY_ACTIVE);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmittedRef.current) return;
    if (el.innerHTML === value) {
      lastEmittedRef.current = value;
      return;
    }
    el.innerHTML = value || '';
    lastEmittedRef.current = value || '';
  }, [value]);

  const refreshActive = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setActive(EMPTY_ACTIVE);
      return;
    }

    const anchor = selection.anchorNode;
    if (!anchor || !el.contains(anchor)) {
      // Keep last highlight while user clicks toolbar (mousedown prevents blur race),
      // but clear if focus left the editor entirely.
      if (document.activeElement !== el) {
        setActive(EMPTY_ACTIVE);
      }
      return;
    }

    const queryState = (cmd: string) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };

    const queryValue = (cmd: string) => {
      try {
        return (document.queryCommandValue(cmd) || '').toString().toLowerCase();
      } catch {
        return '';
      }
    };

    const block = queryValue('formatBlock').replace(/[<>]/g, '');

    setActive({
      bold: queryState('bold'),
      italic: queryState('italic'),
      underline: queryState('underline'),
      strikeThrough: queryState('strikeThrough'),
      unorderedList: queryState('insertUnorderedList'),
      orderedList: queryState('insertOrderedList'),
      justifyLeft: queryState('justifyLeft'),
      justifyCenter: queryState('justifyCenter'),
      justifyRight: queryState('justifyRight'),
      block,
    });
  }, []);

  useEffect(() => {
    const onSelChange = () => refreshActive();
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [refreshActive]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastEmittedRef.current = html;
    onChange(html);
    refreshActive();
  }, [onChange, refreshActive]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      editorRef.current?.focus();
      // execCommand is deprecated but still works everywhere; see note above.
      document.execCommand(command, false, arg);
      emit();
      // Some browsers update queryCommandState one tick after execCommand.
      requestAnimationFrame(() => refreshActive());
    },
    [emit, refreshActive]
  );

  const handleLink = useCallback(() => {
    const url = window.prompt('Enter URL (https://…)');
    if (!url) return;
    exec('createLink', url);
  }, [exec]);

  const handleClear = useCallback(() => {
    exec('removeFormat');
  }, [exec]);

  const insertTable = useCallback(() => {
    editorRef.current?.focus();
    const colRaw = window.prompt('Number of columns (2–6)', '3');
    if (colRaw === null) return;
    const rowRaw = window.prompt('Number of rows including header (2–8)', '3');
    if (rowRaw === null) return;
    const cols = Math.min(6, Math.max(2, Number.parseInt(colRaw, 10) || 3));
    const rows = Math.min(8, Math.max(2, Number.parseInt(rowRaw, 10) || 3));

    const headerCells = Array.from({ length: cols }, (_, i) => `<th>Header ${i + 1}</th>`).join('');
    const bodyRows = Array.from({ length: rows - 1 }, () => {
      const cells = Array.from({ length: cols }, () => '<td><br></td>').join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const html =
      `<table class="rte-table"><thead><tr>${headerCells}</tr></thead>` +
      `<tbody>${bodyRows}</tbody></table><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    emit();
  }, [emit]);

  const isHeading = (tag: string) => active.block === tag || active.block === tag.toLowerCase();

  return (
    <div className="border rounded-md bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b bg-gray-50 px-2 py-1.5">
        <ToolbarButton title="Bold (Ctrl+B)" active={active.bold} onClick={() => exec('bold')}>
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic (Ctrl+I)" active={active.italic} onClick={() => exec('italic')}>
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline (Ctrl+U)"
          active={active.underline}
          onClick={() => exec('underline')}
        >
          <Underline className="w-4 h-4" />
        </ToolbarButton>
        {!compact && (
          <ToolbarButton
            title="Strikethrough"
            active={active.strikeThrough}
            onClick={() => exec('strikeThrough')}
          >
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
        )}
        <Divider />
        {!compact && (
          <>
            <ToolbarButton
              title="Heading 1"
              active={isHeading('h1')}
              onClick={() => exec('formatBlock', 'H1')}
            >
              <Heading1 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Heading 2"
              active={isHeading('h2')}
              onClick={() => exec('formatBlock', 'H2')}
            >
              <Heading2 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Heading 3"
              active={isHeading('h3')}
              onClick={() => exec('formatBlock', 'H3')}
            >
              <Heading3 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Paragraph"
              active={isHeading('p') || active.block === 'div'}
              onClick={() => exec('formatBlock', 'P')}
            >
              <span className="text-[11px] font-medium leading-none">P</span>
            </ToolbarButton>
            <Divider />
          </>
        )}
        <ToolbarButton
          title="Bullet list"
          active={active.unorderedList}
          onClick={() => exec('insertUnorderedList')}
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={active.orderedList}
          onClick={() => exec('insertOrderedList')}
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Insert table" onClick={insertTable}>
          <Table2 className="w-4 h-4" />
        </ToolbarButton>
        {!compact && (
          <>
            <Divider />
            <ToolbarButton
              title="Align left"
              active={active.justifyLeft}
              onClick={() => exec('justifyLeft')}
            >
              <AlignLeft className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Align center"
              active={active.justifyCenter}
              onClick={() => exec('justifyCenter')}
            >
              <AlignCenter className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Align right"
              active={active.justifyRight}
              onClick={() => exec('justifyRight')}
            >
              <AlignRight className="w-4 h-4" />
            </ToolbarButton>
            <Divider />
            <ToolbarButton title="Insert link" onClick={handleLink}>
              <LinkIcon className="w-4 h-4" />
            </ToolbarButton>
          </>
        )}
        <ToolbarButton title="Clear formatting" onClick={handleClear}>
          <Eraser className="w-4 h-4" />
        </ToolbarButton>
        {!compact && (
          <>
            <Divider />
            <ToolbarButton title="Undo" onClick={() => exec('undo')}>
              <Undo2 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton title="Redo" onClick={() => exec('redo')}>
              <Redo2 className="w-4 h-4" />
            </ToolbarButton>
          </>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        className="lh-rte-content px-3 py-2 text-sm focus:outline-none"
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        onFocus={refreshActive}
        onPaste={(event) => {
          event.preventDefault();
          const rawHtml = event.clipboardData.getData('text/html');
          const text = event.clipboardData.getData('text/plain');
          if (rawHtml) {
            // Sanitize Word/Google Docs clipboard HTML — strips <html>/<body>/<meta>/
            // <colgroup>/<col>/namespace tags while keeping tables, lists, headings etc.
            const clean = DOMPurify.sanitize(rawHtml, {
              ALLOWED_TAGS: [
                'p', 'br', 'span', 'div', 'strong', 'em', 'u', 's', 'b', 'i',
                'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
              ],
              ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'colspan', 'rowspan'],
              ALLOW_DATA_ATTR: false,
            });
            if (clean.trim()) {
              document.execCommand('insertHTML', false, clean);
            } else {
              // Sanitizer stripped everything (pure namespace soup) — fall back to plain text
              document.execCommand('insertText', false, text);
            }
          } else {
            document.execCommand('insertText', false, text);
          }
          emit();
        }}
      />
      <style>{`
        .lh-rte-content:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .lh-rte-content { line-height: 1.5; font-weight: 400; }
        .lh-rte-content p, .lh-rte-content div, .lh-rte-content span, .lh-rte-content li { font-weight: 400; }
        .lh-rte-content b, .lh-rte-content strong { font-weight: 700; }
        .lh-rte-content i, .lh-rte-content em { font-style: italic; }
        .lh-rte-content u { text-decoration: underline; }
        .lh-rte-content h1 { font-size: 1.15rem; font-weight: 700; margin: 0.4rem 0; }
        .lh-rte-content h2 { font-size: 1.05rem; font-weight: 700; margin: 0.4rem 0; }
        .lh-rte-content h3 { font-size: 0.98rem; font-weight: 600; margin: 0.35rem 0; }
        .lh-rte-content p { margin: 0.25rem 0; }
        .lh-rte-content ul, .lh-rte-content ol { padding-left: 1.25rem; margin: 0.25rem 0; }
        .lh-rte-content a { color: #0369a1; text-decoration: underline; }
        .lh-rte-content table.rte-table,
        .lh-rte-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.5rem 0;
          table-layout: fixed;
        }
        .lh-rte-content th,
        .lh-rte-content td {
          border: 1px solid #d1d5db;
          padding: 6px 8px;
          text-align: left;
          vertical-align: top;
          word-break: break-word;
          min-width: 48px;
        }
        .lh-rte-content th {
          background: #f3f4f6;
          font-weight: 700;
          color: #111827;
        }
        .lh-rte-content tbody tr:nth-child(even) td {
          background: #f9fafb;
        }
      `}</style>
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  children,
  active = false,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={title}
      aria-pressed={active}
      className={cn(
        'h-7 w-7 p-0 text-gray-700 hover:bg-gray-200',
        active && 'bg-blue-100 text-blue-700 hover:bg-blue-200 ring-1 ring-blue-300'
      )}
      // mousedown instead of click so the active selection isn't lost.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden />;
}
