import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, FolderOpen, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  DraftIndexEntry,
  DraftKind,
  deleteDraft,
  formatDraftTimestamp,
  listDrafts,
  loadDraft,
  saveDraft,
} from '@/lib/document-drafts';

interface DraftToolbarProps<TSnapshot extends object> {
  kind: DraftKind;
  /** Returns a JSON-serializable snapshot of the current form state. */
  getSnapshot: () => TSnapshot;
  /** Apply a previously-saved snapshot back into the form state. */
  onLoad: (snapshot: TSnapshot) => void;
  /**
   * Optional short label used in the saved-drafts dropdown so the user can
   * recognise the entry (e.g. document number + customer name).
   * Falls back to "Untitled".
   */
  buildLabel?: (snapshot: TSnapshot) => string;
  className?: string;
  /** Visible name in the empty-state message (e.g. "quotation"). */
  documentNoun?: string;
}

export default function DraftToolbar<TSnapshot extends object>({
  kind,
  getSnapshot,
  onLoad,
  buildLabel,
  className,
  documentNoun = 'document',
}: DraftToolbarProps<TSnapshot>) {
  const [drafts, setDrafts] = useState<DraftIndexEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setDrafts(listDrafts(kind));
  }, [kind]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep the drafts list fresh whenever the dropdown reopens so the timestamps
  // shown match what's actually in storage (e.g. saves done in another tab).
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleSave = useCallback(() => {
    try {
      const snap = getSnapshot();
      const label = (buildLabel ? buildLabel(snap) : 'Untitled').trim() || 'Untitled';
      const id = saveDraft(kind, snap, { id: currentDraftId || undefined, label });
      if (!id) {
        toast.error(
          'Could not save draft — storage is full or unavailable. Try deleting old drafts.'
        );
        return;
      }
      setCurrentDraftId(id);
      refresh();
      toast.success(currentDraftId ? 'Draft updated' : 'Draft saved locally');
    } catch (err) {
      console.error('Failed to save draft', err);
      toast.error('Could not save draft.');
    }
  }, [buildLabel, currentDraftId, getSnapshot, kind, refresh]);

  const handleLoad = useCallback(
    (id: string) => {
      const snap = loadDraft<TSnapshot>(kind, id);
      if (!snap) {
        // Index entry without payload (cleared storage, corrupt data).
        deleteDraft(kind, id);
        refresh();
        toast.error('Draft was missing or expired and has been removed.');
        return;
      }
      try {
        onLoad(snap);
        setCurrentDraftId(id);
        toast.success('Draft loaded');
      } catch (err) {
        console.error('Failed to apply draft', err);
        toast.error('Draft is from an older version and could not be applied.');
      }
    },
    [kind, onLoad]
  );

  const handleDelete = useCallback(
    (id: string, evt: React.MouseEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      deleteDraft(kind, id);
      if (currentDraftId === id) setCurrentDraftId(null);
      refresh();
      toast.success('Draft removed');
    },
    [currentDraftId, kind, refresh]
  );

  const hasDrafts = drafts.length > 0;
  const triggerLabel = useMemo(
    () => `Drafts${hasDrafts ? ` (${drafts.length})` : ''}`,
    [drafts.length, hasDrafts]
  );

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleSave}
        title={currentDraftId ? 'Update this draft' : 'Save a local draft'}
      >
        <Save className="w-4 h-4 mr-1.5" />
        {currentDraftId ? 'Update Draft' : 'Save Draft'}
      </Button>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            <FolderOpen className="w-4 h-4 mr-1.5" />
            {triggerLabel}
            <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[320px]">
          <DropdownMenuLabel>Local drafts</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {!hasDrafts ? (
            <div className="px-3 py-3 text-sm text-slate-500">
              No saved drafts. Use{' '}
              <span className="font-medium text-slate-700">Save Draft</span> to keep
              a working copy of this {documentNoun} on this device.
            </div>
          ) : (
            drafts.map((d) => (
              <DropdownMenuItem
                key={d.id}
                className="flex items-start gap-2 py-2 cursor-pointer"
                onSelect={(evt) => {
                  evt.preventDefault();
                  handleLoad(d.id);
                  setOpen(false);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {d.label || 'Untitled'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDraftTimestamp(d.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(evt) => handleDelete(d.id, evt)}
                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  aria-label="Delete draft"
                  title="Delete draft"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
