import { useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

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
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // Tracks the last value we either accepted from props or emitted ourselves;
  // prevents the React render loop from blowing away the user's caret while typing.
  const lastEmittedRef = useRef<string>('');

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

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastEmittedRef.current = html;
    onChange(html);
  }, [onChange]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      editorRef.current?.focus();
      // execCommand is deprecated but still works everywhere; see note above.
      document.execCommand(command, false, arg);
      emit();
    },
    [emit]
  );

  const handleLink = useCallback(() => {
    const url = window.prompt('Enter URL (https://…)');
    if (!url) return;
    exec('createLink', url);
  }, [exec]);

  const handleClear = useCallback(() => {
    exec('removeFormat');
  }, [exec]);

  return (
    <div className="border rounded-md bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b bg-gray-50 px-2 py-1.5">
        <ToolbarButton title="Bold (Ctrl+B)" onClick={() => exec('bold')}>
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic (Ctrl+I)" onClick={() => exec('italic')}>
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline (Ctrl+U)" onClick={() => exec('underline')}>
          <Underline className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" onClick={() => exec('strikeThrough')}>
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Heading 1" onClick={() => exec('formatBlock', 'H1')}>
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Heading 2" onClick={() => exec('formatBlock', 'H2')}>
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Heading 3" onClick={() => exec('formatBlock', 'H3')}>
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Paragraph" onClick={() => exec('formatBlock', 'P')}>
          <span className="text-[11px] font-medium leading-none">P</span>
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Bullet list" onClick={() => exec('insertUnorderedList')}>
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Align left" onClick={() => exec('justifyLeft')}>
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Align center" onClick={() => exec('justifyCenter')}>
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Align right" onClick={() => exec('justifyRight')}>
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Insert link" onClick={handleLink}>
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Clear formatting" onClick={handleClear}>
          <Eraser className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Undo" onClick={() => exec('undo')}>
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => exec('redo')}>
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>
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
        onPaste={(event) => {
          // Strip rich formatting from pasted content so the editor stays predictable.
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
      />
      <style>{`
        .lh-rte-content:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .lh-rte-content { line-height: 1.5; }
        .lh-rte-content h1 { font-size: 1.15rem; font-weight: 700; margin: 0.4rem 0; }
        .lh-rte-content h2 { font-size: 1.05rem; font-weight: 700; margin: 0.4rem 0; }
        .lh-rte-content h3 { font-size: 0.98rem; font-weight: 600; margin: 0.35rem 0; }
        .lh-rte-content p { margin: 0.25rem 0; }
        .lh-rte-content ul, .lh-rte-content ol { padding-left: 1.25rem; margin: 0.25rem 0; }
        .lh-rte-content a { color: #0369a1; text-decoration: underline; }
      `}</style>
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={title}
      className="h-7 w-7 p-0 text-gray-700 hover:bg-gray-200"
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
