import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  createDefaultServiceDocumentTerms,
  formatServiceDocumentTermsForPdf,
  type ServiceDocumentTermItem,
} from '@/lib/service-document-terms';

type DocumentTermsEditorProps = {
  items: ServiceDocumentTermItem[];
  onChange: (items: ServiceDocumentTermItem[]) => void;
};

type DropHint = { index: number; position: 'before' | 'after' } | null;

function reorderItems(items: ServiceDocumentTermItem[], from: number, to: number): ServiceDocumentTermItem[] {
  if (from === to || from < 0 || to < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  const clampedTo = Math.max(0, Math.min(to, next.length));
  next.splice(clampedTo, 0, moved);
  return next;
}

function resolveInsertIndex(from: number, overIndex: number, position: 'before' | 'after'): number {
  let insertAt = position === 'before' ? overIndex : overIndex + 1;
  if (from < insertAt) insertAt -= 1;
  return insertAt;
}

const AUTO_SCROLL_EDGE_PX = 80;
const AUTO_SCROLL_MAX_SPEED = 20;

function findScrollableAncestor(node: HTMLElement | null): HTMLElement {
  let parent = node?.parentElement ?? null;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.documentElement;
}

function autoScrollContainer(scrollEl: HTMLElement, clientY: number): void {
  const rect = scrollEl.getBoundingClientRect();
  const distFromBottom = rect.bottom - clientY;
  const distFromTop = clientY - rect.top;

  if (distFromBottom < AUTO_SCROLL_EDGE_PX) {
    const intensity = Math.min(1, (AUTO_SCROLL_EDGE_PX - Math.max(distFromBottom, 0)) / AUTO_SCROLL_EDGE_PX + 0.15);
    scrollEl.scrollTop += AUTO_SCROLL_MAX_SPEED * intensity;
  } else if (distFromTop < AUTO_SCROLL_EDGE_PX) {
    const intensity = Math.min(1, (AUTO_SCROLL_EDGE_PX - Math.max(distFromTop, 0)) / AUTO_SCROLL_EDGE_PX + 0.15);
    scrollEl.scrollTop -= AUTO_SCROLL_MAX_SPEED * intensity;
  }
}

export default function DocumentTermsEditor({ items, onChange }: DocumentTermsEditorProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const pointerYRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const [newTermText, setNewTermText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<DropHint>(null);

  const preview = useMemo(() => formatServiceDocumentTermsForPdf(items), [items]);
  const enabledCount = items.filter((item) => item.enabled).length;

  const updateItem = useCallback(
    (index: number, patch: Partial<ServiceDocumentTermItem>) => {
      onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    },
    [items, onChange]
  );

  const removeItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange]
  );

  const moveItem = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return;
      onChange(reorderItems(items, index, target));
    },
    [items, onChange]
  );

  const addCustomTerm = () => {
    const text = newTermText.trim();
    if (!text) return;
    onChange([
      ...items,
      {
        id: `custom-${Date.now()}`,
        text,
        enabled: true,
        group: 'custom',
      },
    ]);
    setNewTermText('');
  };

  const clearDragState = useCallback(() => {
    draggingRef.current = false;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    setDragIndex(null);
    setDropHint(null);
  }, []);

  const tickAutoScroll = useCallback(() => {
    if (!draggingRef.current) return;
    const scrollEl = findScrollableAncestor(listRef.current);
    autoScrollContainer(scrollEl, pointerYRef.current);
    scrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, []);

  const trackPointer = useCallback((clientY: number) => {
    pointerYRef.current = clientY;
  }, []);

  useEffect(() => {
    if (dragIndex === null) return;

    const onDragOver = (event: DragEvent) => {
      trackPointer(event.clientY);
      event.preventDefault();
    };

    document.addEventListener('dragover', onDragOver, { passive: false });
    return () => document.removeEventListener('dragover', onDragOver);
  }, [dragIndex, trackPointer]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleDragStart = useCallback(
    (index: number, event: React.DragEvent) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      if (event.currentTarget instanceof HTMLElement) {
        event.dataTransfer.setDragImage(event.currentTarget, 16, 16);
      }
      trackPointer(event.clientY);
      draggingRef.current = true;
      setDragIndex(index);
      setDropHint(null);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      scrollRafRef.current = requestAnimationFrame(tickAutoScroll);
    },
    [tickAutoScroll, trackPointer]
  );

  const handleDragOver = useCallback(
    (index: number, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      trackPointer(event.clientY);
      if (dragIndex === null || dragIndex === index) {
        setDropHint(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const position: 'before' | 'after' =
        event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

      setDropHint((prev) =>
        prev?.index === index && prev.position === position ? prev : { index, position }
      );
    },
    [dragIndex, trackPointer]
  );

  const handleDrop = useCallback(
    (overIndex: number, event: React.DragEvent) => {
      event.preventDefault();
      if (dragIndex === null) {
        clearDragState();
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const position: 'before' | 'after' =
        event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      const insertAt = resolveInsertIndex(dragIndex, overIndex, position);

      if (insertAt !== dragIndex) {
        onChange(reorderItems(items, dragIndex, insertAt));
      }
      clearDragState();
    },
    [clearDragState, dragIndex, items, onChange]
  );

  return (
    <div
      className="space-y-4"
      onDragOver={(event) => {
        if (dragIndex === null) return;
        event.preventDefault();
        trackPointer(event.clientY);
      }}
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs sm:text-sm text-slate-600">
        <span className="font-medium text-slate-800">{enabledCount} term(s)</span> will appear on the
        PDF. Standard terms are on by default; enable warranty terms as needed. Drag the handle or use
        arrows to reorder, and edit any line.
      </div>

      <div
        ref={listRef}
        className="space-y-2"
        onDragOver={(event) => {
          event.preventDefault();
          trackPointer(event.clientY);
        }}
        onDragLeave={(event) => {
          // Only clear when leaving the list, not when moving between children
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropHint(null);
          }
        }}
      >
        {items.map((item, index) => {
          const isDragging = dragIndex === index;
          const showBefore =
            dropHint?.index === index && dropHint.position === 'before' && dragIndex !== index;
          const showAfter =
            dropHint?.index === index && dropHint.position === 'after' && dragIndex !== index;

          return (
            <div
              key={item.id}
              onDragOver={(event) => handleDragOver(index, event)}
              onDrop={(event) => handleDrop(index, event)}
              className={cn(
                'relative rounded-lg border bg-white p-3 transition-[opacity,box-shadow,border-color] duration-150',
                isDragging && 'opacity-40 border-dashed border-violet-300 bg-violet-50/30',
                !isDragging && 'border-slate-200',
                !item.enabled && !isDragging && 'opacity-70'
              )}
            >
              {showBefore ? (
                <div
                  className="pointer-events-none absolute left-2 right-2 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-violet-500 shadow-[0_0_0_2px_rgba(139,92,246,0.25)]"
                  aria-hidden
                />
              ) : null}
              {showAfter ? (
                <div
                  className="pointer-events-none absolute bottom-0 left-2 right-2 z-10 h-0.5 translate-y-1/2 rounded-full bg-violet-500 shadow-[0_0_0_2px_rgba(139,92,246,0.25)]"
                  aria-hidden
                />
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex items-center gap-2 sm:shrink-0">
                  <div
                    draggable
                    onDragStart={(event) => handleDragStart(index, event)}
                    onDragEnd={clearDragState}
                    className="flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                    aria-label="Drag to reorder"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        moveItem(index, -1);
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        moveItem(index, 1);
                      }
                    }}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <Checkbox
                    id={`term-enabled-${item.id}`}
                    checked={item.enabled}
                    onCheckedChange={(checked) => updateItem(index, { enabled: checked === true })}
                  />
                  <Label htmlFor={`term-enabled-${item.id}`} className="sr-only">
                    Include term
                  </Label>
                </div>

                <div className="min-w-0 flex-1">
                  <Input
                    value={item.text}
                    onChange={(e) => updateItem(index, { text: e.target.value })}
                    className="text-sm"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {item.group === 'custom' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => removeItem(index)}
                      aria-label="Remove term"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={newTermText}
          onChange={(e) => setNewTermText(e.target.value)}
          placeholder="Add a custom term…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustomTerm();
            }
          }}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={addCustomTerm} disabled={!newTermText.trim()}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add term
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(createDefaultServiceDocumentTerms())}
        >
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Reset defaults
        </Button>
      </div>

      {preview ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            PDF preview
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            {preview.split('\n').map((line) => (
              <li key={line}>{line.replace(/^\d+\.\s*/, '')}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-amber-700">No terms selected — enable at least one term for the PDF.</p>
      )}
    </div>
  );
}
