import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  RefreshCw,
  Package,
  Layers,
  MoreVertical,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useDraggable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { filterInventoryByApproxSearch } from '@/lib/inventorySearch';
import { inventoryCache } from '@/lib/inventoryCache';
import { cn } from '@/lib/utils';

type StoragePlace = {
  id: string;
  name: string;
  sort_order: number;
};

type StorageBlock = {
  id: string;
  place_id: string;
  name: string;
  notes: string | null;
  sort_order: number;
  parent_block_id: string | null;
};

type InventorySlim = {
  id: string;
  product_name: string;
  code: string | null;
};

type BlockItem = {
  id: string;
  block_id: string;
  inventory_id: string;
  quantity: number;
  inventory?: InventorySlim | InventorySlim[] | null;
};

type ItemSummary = { count: number; labels: string[] };

const FLOOR_DROP_ID = 'drop-floor';
const CATALOG_CACHE_KEY = 'inventory_items';

const boxDragId = (boxId: string) => `box:${boxId}`;
const boxDropId = (boxId: string) => `box-drop:${boxId}`;

function parseId(id: string | number): { kind: 'box' | 'floor'; id: string } | null {
  const s = String(id);
  if (s === FLOOR_DROP_ID) return { kind: 'floor', id: '' };
  if (s.startsWith('box-drop:')) return { kind: 'box', id: s.slice(9) };
  if (s.startsWith('box:')) return { kind: 'box', id: s.slice(4) };
  return null;
}

const collisionDetection: CollisionDetection = (args) => {
  const filterTargets = (hits: ReturnType<CollisionDetection>) =>
    hits.filter((c) => {
      const id = String(c.id);
      return id.startsWith('box-drop:') || id === FLOOR_DROP_ID;
    });

  // Prefer what's under the pointer; fall back to closest intersecting droppable
  const pointer = filterTargets(pointerWithin(args));
  if (pointer.length) return pointer;

  const rect = filterTargets(rectIntersection(args));
  if (rect.length) return rect;

  // Last resort: any droppable near the dragged rect center
  const { droppableContainers, collisionRect } = args;
  if (!collisionRect) return [];
  const center = {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  let best: { id: string | number; dist: number } | null = null;
  for (const container of droppableContainers) {
    const id = String(container.id);
    if (!id.startsWith('box-drop:') && id !== FLOOR_DROP_ID) continue;
    const r = container.rect.current;
    if (!r) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = (cx - center.x) ** 2 + (cy - center.y) ** 2;
    if (!best || dist < best.dist) best = { id: container.id, dist };
  }
  return best ? [{ id: best.id }] : [];
};

function inventoryOf(item: BlockItem): InventorySlim | null {
  const inv = item.inventory;
  if (!inv) return null;
  return Array.isArray(inv) ? inv[0] || null : inv;
}

function collectDescendantIds(blocks: StorageBlock[], blockId: string): Set<string> {
  const childrenByParent = new Map<string | null, StorageBlock[]>();
  for (const b of blocks) {
    const key = b.parent_block_id;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(b);
  }
  const out = new Set<string>();
  const walk = (id: string) => {
    out.add(id);
    for (const child of childrenByParent.get(id) || []) walk(child.id);
  };
  walk(blockId);
  return out;
}

function buildStacks(blocks: StorageBlock[]): StorageBlock[][] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const childrenByParent = new Map<string, StorageBlock[]>();
  for (const b of blocks) {
    if (!b.parent_block_id) continue;
    if (!childrenByParent.has(b.parent_block_id)) childrenByParent.set(b.parent_block_id, []);
    childrenByParent.get(b.parent_block_id)!.push(b);
  }
  for (const kids of childrenByParent.values()) {
    kids.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  const claimed = new Set<string>();
  const roots = blocks
    .filter((b) => !b.parent_block_id || !byId.has(b.parent_block_id))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const columns: StorageBlock[][] = [];
  const takeChain = (start: StorageBlock): StorageBlock[] => {
    const chain: StorageBlock[] = [];
    let current: StorageBlock | undefined = start;
    while (current && !claimed.has(current.id)) {
      claimed.add(current.id);
      chain.push(current);
      const kids = (childrenByParent.get(current.id) || []).filter((k) => !claimed.has(k.id));
      current = kids[0];
    }
    return chain;
  };

  for (const root of roots) {
    if (!claimed.has(root.id)) columns.push(takeChain(root));
  }
  for (const b of blocks) {
    if (!claimed.has(b.id)) columns.push(takeChain(b));
  }
  return columns.filter((c) => c.length > 0);
}

function FloorDropZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: FLOOR_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'shrink-0 self-stretch rounded-lg border-2 border-dashed flex items-center justify-center text-center px-2 text-xs transition-all',
        active || isOver
          ? 'w-28 sm:w-36 min-h-[8rem] border-sky-500 bg-sky-50 text-sky-800'
          : 'w-10 sm:w-12 min-h-[5rem] border-slate-200 text-slate-400 bg-slate-50/50'
      )}
      title="Drop here to unstack / put on floor"
    >
      {active || isOver ? 'Drop here to unstack' : 'Floor'}
    </div>
  );
}

function BoxCard({
  box,
  isBottom,
  summary,
  isDropTarget,
  onOpenContents,
  onEdit,
  onDelete,
}: {
  box: StorageBlock;
  isBottom: boolean;
  summary?: ItemSummary;
  isDropTarget?: boolean;
  onOpenContents: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: boxDragId(box.id),
    data: { type: 'box', boxId: box.id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: boxDropId(box.id),
    data: { type: 'box', boxId: box.id },
    disabled: isDragging,
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef]
  );

  const highlight = isOver || !!isDropTarget;
  const summaryText = summary
    ? summary.labels.join(', ') + (summary.count > 2 ? ` +${summary.count - 2}` : '')
    : 'Empty';

  return (
    <div
      ref={setRefs}
      {...listeners}
      {...attributes}
      className={cn(
        'group relative border-b last:border-b-0 bg-white p-3 touch-manipulation transition-colors select-none',
        !isBottom && 'border-dashed border-slate-200',
        highlight && 'ring-2 ring-inset ring-sky-500 bg-sky-50',
        isDragging ? 'opacity-30 cursor-grabbing' : 'cursor-grab hover:bg-slate-50/80'
      )}
    >
      {highlight && (
        <p className="text-[11px] font-medium text-sky-700 mb-1.5">Release to stack here</p>
      )}
      <div className="flex items-start gap-1 min-w-0">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900 leading-snug block truncate">
            {box.name}
          </span>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{summaryText}</p>
        </div>
        <div
          className="shrink-0 -mr-1 -mt-0.5"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 opacity-60 group-hover:opacity-100"
                aria-label={`Actions for ${box.name}`}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onOpenContents}>
                <Package className="w-4 h-4 mr-2" />
                Items
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function StackColumn({
  column,
  itemCountByBlock,
  overBoxId,
  onOpenContents,
  onEdit,
  onDelete,
}: {
  column: StorageBlock[];
  itemCountByBlock: Map<string, ItemSummary>;
  overBoxId: string | null;
  onOpenContents: (box: StorageBlock) => void;
  onEdit: (box: StorageBlock) => void;
  onDelete: (box: StorageBlock) => void;
}) {
  const root = column[0];
  const display = [...column].reverse();

  return (
    <div className="flex flex-col w-[11.5rem] sm:w-48 shrink-0 rounded-xl border border-slate-200 overflow-hidden bg-slate-50/60 shadow-sm snap-start">
      {display.map((box) => (
        <BoxCard
          key={box.id}
          box={box}
          isBottom={box.id === root.id}
          summary={itemCountByBlock.get(box.id)}
          isDropTarget={overBoxId === box.id}
          onOpenContents={() => onOpenContents(box)}
          onEdit={() => onEdit(box)}
          onDelete={() => onDelete(box)}
        />
      ))}
    </div>
  );
}

const StorageLocationsMap: React.FC = () => {
  const [places, setPlaces] = useState<StoragePlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<StorageBlock[]>([]);
  const [placeItems, setPlaceItems] = useState<BlockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [placesLoaded, setPlacesLoaded] = useState(false);

  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<StoragePlace | null>(null);
  const [placeName, setPlaceName] = useState('');

  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<StorageBlock | null>(null);
  const [boxName, setBoxName] = useState('');
  const [boxNotes, setBoxNotes] = useState('');
  const [movePlaceId, setMovePlaceId] = useState('');
  const [deleteConfirmBox, setDeleteConfirmBox] = useState<StorageBlock | null>(null);
  const [deleteConfirmPlace, setDeleteConfirmPlace] = useState<StoragePlace | null>(null);

  const [contentsOpen, setContentsOpen] = useState(false);
  const [activeBox, setActiveBox] = useState<StorageBlock | null>(null);
  const [boxItems, setBoxItems] = useState<BlockItem[]>([]);
  const [boxItemsLoading, setBoxItemsLoading] = useState(false);
  const [catalog, setCatalog] = useState<InventorySlim[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [addQty, setAddQty] = useState('1');

  const [whereQuery, setWhereQuery] = useState('');
  const [whereResults, setWhereResults] = useState<
    Array<{
      product_name: string;
      code: string | null;
      quantity: number;
      place_name: string;
      box_name: string;
      parent_box_name: string | null;
    }>
  >([]);
  const [whereSearching, setWhereSearching] = useState(false);
  const [whereCatalog, setWhereCatalog] = useState<InventorySlim[]>([]);
  const [showWhereSuggestions, setShowWhereSuggestions] = useState(false);
  const whereSuggestRef = useRef<HTMLDivElement>(null);

  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [overBoxId, setOverBoxId] = useState<string | null>(null);
  const [isDraggingBox, setIsDraggingBox] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db.storagePlaces.getAll();
      if (error) throw error;
      const list = (data || []) as StoragePlace[];
      setPlaces(list);
      setPlacesLoaded(true);
      if (list.length > 0 && !selectedPlaceId) setSelectedPlaceId(list[0].id);
      else if (selectedPlaceId && !list.some((p) => p.id === selectedPlaceId)) {
        setSelectedPlaceId(list[0]?.id ?? null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load places';
      toast.error(
        msg.includes('storage_places') || msg.includes('schema cache')
          ? 'Storage tables missing — run scripts/add-storage-locations.sql in Supabase'
          : msg
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPlaceId]);

  const loadPlaceMap = useCallback(async (placeId: string) => {
    setLoading(true);
    try {
      const [blocksRes, itemsRes] = await Promise.all([
        db.storageBlocks.getByPlace(placeId),
        db.storageBlockItems.getByPlace(placeId),
      ]);
      if (blocksRes.error) throw blocksRes.error;
      if (itemsRes.error) throw itemsRes.error;
      setBlocks((blocksRes.data || []) as StorageBlock[]);
      setPlaceItems((itemsRes.data || []) as BlockItem[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load boxes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPlaceId) loadPlaceMap(selectedPlaceId);
    else {
      setBlocks([]);
      setPlaceItems([]);
    }
  }, [selectedPlaceId, loadPlaceMap]);

  const itemCountByBlock = useMemo(() => {
    const map = new Map<string, ItemSummary>();
    for (const item of placeItems) {
      const inv = inventoryOf(item);
      const cur = map.get(item.block_id) || { count: 0, labels: [] };
      cur.count += 1;
      if (inv?.product_name && cur.labels.length < 2) {
        cur.labels.push(`${inv.product_name}×${item.quantity}`);
      }
      map.set(item.block_id, cur);
    }
    return map;
  }, [placeItems]);

  const stacks = useMemo(() => buildStacks(blocks), [blocks]);
  const rootCount = useMemo(() => stacks.length, [stacks]);

  const filteredCatalog = useMemo(
    () => filterInventoryByApproxSearch(catalog, itemSearch).slice(0, 40),
    [catalog, itemSearch]
  );

  const whereSuggestions = useMemo(() => {
    const q = whereQuery.trim();
    if (q.length < 1) return [];
    return filterInventoryByApproxSearch(whereCatalog, q).slice(0, 8);
  }, [whereCatalog, whereQuery]);

  const ensureWhereCatalog = useCallback(async () => {
    if (whereCatalog.length > 0) return;
    const cached = inventoryCache.get<InventorySlim[]>(CATALOG_CACHE_KEY);
    if (cached?.length) {
      setWhereCatalog(
        cached.map((c) => ({ id: c.id, product_name: c.product_name, code: c.code ?? null }))
      );
      return;
    }
    const { data, error } = await db.inventory.getAll();
    if (error) {
      toast.error(error.message || 'Failed to load products');
      return;
    }
    const slim = (data || []).map((c: { id: string; product_name: string; code: string | null }) => ({
      id: c.id,
      product_name: c.product_name,
      code: c.code,
    }));
    setWhereCatalog(slim);
    inventoryCache.set(CATALOG_CACHE_KEY, data || []);
  }, [whereCatalog.length]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!whereSuggestRef.current?.contains(e.target as Node)) {
        setShowWhereSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const mapWhereRows = async (
    data: Array<{
      quantity: number;
      inventory?: InventorySlim | InventorySlim[] | null;
      block?:
        | {
            id: string;
            name: string;
            parent_block_id: string | null;
            place?: { id: string; name: string } | { id: string; name: string }[] | null;
          }
        | {
            id: string;
            name: string;
            parent_block_id: string | null;
            place?: { id: string; name: string } | { id: string; name: string }[] | null;
          }[]
        | null;
    }>
  ) => {
    const allBlocks = (await db.storageBlocks.getAllSlim()).data || [];
    const blockNameById = new Map(allBlocks.map((b) => [b.id, b.name]));
    return data.map((row) => {
      const inv = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
      const block = Array.isArray(row.block) ? row.block[0] : row.block;
      const placeRaw = block?.place;
      const place = Array.isArray(placeRaw) ? placeRaw[0] : placeRaw;
      return {
        product_name: inv?.product_name || 'Unknown',
        code: inv?.code || null,
        quantity: row.quantity,
        place_name: place?.name || '—',
        box_name: block?.name || '—',
        parent_box_name: block?.parent_block_id
          ? blockNameById.get(block.parent_block_id) || null
          : null,
      };
    });
  };

  const runWhereSearch = async (opts?: { query?: string; inventoryId?: string }) => {
    const q = (opts?.query ?? whereQuery).trim();
    const inventoryId = opts?.inventoryId;
    if (!q && !inventoryId) {
      setWhereResults([]);
      return;
    }
    setShowWhereSuggestions(false);
    setWhereSearching(true);
    try {
      let ids: string[] = [];
      if (inventoryId) {
        ids = [inventoryId];
      } else {
        let catalogRows = whereCatalog;
        if (!catalogRows.length) {
          const cached = inventoryCache.get<InventorySlim[]>(CATALOG_CACHE_KEY);
          if (cached?.length) {
            catalogRows = cached.map((c) => ({
              id: c.id,
              product_name: c.product_name,
              code: c.code ?? null,
            }));
            setWhereCatalog(catalogRows);
          } else {
            const { data, error } = await db.inventory.getAll();
            if (error) throw error;
            catalogRows = (data || []).map(
              (c: { id: string; product_name: string; code: string | null }) => ({
                id: c.id,
                product_name: c.product_name,
                code: c.code,
              })
            );
            setWhereCatalog(catalogRows);
            inventoryCache.set(CATALOG_CACHE_KEY, data || []);
          }
        }
        ids = filterInventoryByApproxSearch(catalogRows, q)
          .slice(0, 30)
          .map((m) => m.id);
      }

      if (ids.length === 0) {
        setWhereResults([]);
        return;
      }

      const { data, error } = await db.storageBlockItems.findByInventoryIds(ids);
      if (error) throw error;
      setWhereResults(await mapWhereRows(data || []));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setWhereSearching(false);
    }
  };

  const pickWhereSuggestion = (item: InventorySlim) => {
    setWhereQuery(item.product_name);
    setShowWhereSuggestions(false);
    void runWhereSearch({ query: item.product_name, inventoryId: item.id });
  };

  const restackBox = async (boxId: string, ontoBoxId: string | null) => {
    if (ontoBoxId && boxId === ontoBoxId) return;
    if (ontoBoxId) {
      const forbidden = collectDescendantIds(blocks, boxId);
      if (forbidden.has(ontoBoxId)) {
        toast.error('Cannot stack a box onto one sitting on top of it');
        return;
      }
    }

    // Keep a single vertical chain: insert dragged box on top of target,
    // and move the target's previous direct children onto the dragged box.
    const previousChildren = ontoBoxId
      ? blocks.filter((b) => b.parent_block_id === ontoBoxId && b.id !== boxId)
      : [];

    try {
      const { error } = await db.storageBlocks.update(boxId, {
        parent_block_id: ontoBoxId,
        sort_order: ontoBoxId ? 0 : rootCount,
      });
      if (error) throw error;

      if (previousChildren.length > 0) {
        const childResults = await Promise.all(
          previousChildren.map((child) =>
            db.storageBlocks.update(child.id, { parent_block_id: boxId })
          )
        );
        const childFail = childResults.find((r) => r.error);
        if (childFail?.error) throw childFail.error;
      }

      // Optimistic local update so the map rearranges immediately
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id === boxId) {
            return { ...b, parent_block_id: ontoBoxId, sort_order: ontoBoxId ? 0 : rootCount };
          }
          if (previousChildren.some((c) => c.id === b.id)) {
            return { ...b, parent_block_id: boxId };
          }
          return b;
        })
      );

      toast.success(ontoBoxId ? 'Stacked' : 'Moved to floor');
      if (selectedPlaceId) await loadPlaceMap(selectedPlaceId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to move box');
      if (selectedPlaceId) await loadPlaceMap(selectedPlaceId);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const parsed = parseId(event.active.id);
    if (parsed?.kind !== 'box') return;
    const box = blocks.find((b) => b.id === parsed.id);
    setDragLabel(box?.name || 'Box');
    setIsDraggingBox(true);
  };

  const handleDragOver = (event: { over: { id: string | number } | null }) => {
    const over = event.over ? parseId(event.over.id) : null;
    setOverBoxId(over?.kind === 'box' ? over.id : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const from = parseId(event.active.id);
    const to = event.over ? parseId(event.over.id) : null;
    setDragLabel(null);
    setOverBoxId(null);
    setIsDraggingBox(false);

    if (!from || from.kind !== 'box' || !to) return;
    if (to.kind === 'box' && to.id === from.id) return;

    if (to.kind === 'floor') {
      await restackBox(from.id, null);
      return;
    }
    if (to.kind === 'box') {
      await restackBox(from.id, to.id);
    }
  };

  const openCreatePlace = () => {
    setEditingPlace(null);
    setPlaceName('');
    setPlaceDialogOpen(true);
  };

  const openEditPlace = (place: StoragePlace) => {
    setEditingPlace(place);
    setPlaceName(place.name);
    setPlaceDialogOpen(true);
  };

  const savePlace = async () => {
    const name = placeName.trim();
    if (!name) return;
    try {
      if (editingPlace) {
        const { data, error } = await db.storagePlaces.update(editingPlace.id, { name });
        if (error) throw error;
        setPlaces((prev) => prev.map((p) => (p.id === editingPlace.id ? { ...p, ...data } : p)));
        toast.success('Place updated');
      } else {
        const { data, error } = await db.storagePlaces.create({ name, sort_order: places.length });
        if (error) throw error;
        setPlaces((prev) => [...prev, data as StoragePlace]);
        setSelectedPlaceId((data as StoragePlace).id);
        toast.success('Place created');
      }
      setPlaceDialogOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save place');
    }
  };

  const deletePlace = async (id: string) => {
    try {
      const { error } = await db.storagePlaces.delete(id);
      if (error) throw error;
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      if (selectedPlaceId === id) setSelectedPlaceId(null);
      toast.success('Place deleted');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete place');
    }
  };

  const openCreateBox = () => {
    setEditingBox(null);
    setBoxName('');
    setBoxNotes('');
    setBoxDialogOpen(true);
  };

  const openEditBox = (box: StorageBlock) => {
    setEditingBox(box);
    setBoxName(box.name);
    setBoxNotes(box.notes || '');
    setMovePlaceId(box.place_id);
    setBoxDialogOpen(true);
  };

  const saveBox = async () => {
    const name = boxName.trim();
    if (!name || !selectedPlaceId) return;
    try {
      if (editingBox) {
        const updates: {
          name: string;
          notes: string | null;
          place_id?: string;
          parent_block_id?: string | null;
        } = {
          name,
          notes: boxNotes.trim() || null,
        };
        if (movePlaceId && movePlaceId !== editingBox.place_id) {
          updates.place_id = movePlaceId;
          updates.parent_block_id = null;
        }
        const { error } = await db.storageBlocks.update(editingBox.id, updates);
        if (error) throw error;
        toast.success('Box updated');
        setBoxDialogOpen(false);
        if (updates.place_id) setSelectedPlaceId(updates.place_id);
        else await loadPlaceMap(selectedPlaceId);
      } else {
        const { error } = await db.storageBlocks.create({
          place_id: selectedPlaceId,
          name,
          notes: boxNotes.trim() || undefined,
          parent_block_id: null,
          sort_order: rootCount,
        });
        if (error) throw error;
        toast.success('Box added');
        setBoxDialogOpen(false);
        await loadPlaceMap(selectedPlaceId);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save box');
    }
  };

  const deleteBox = async (id: string) => {
    try {
      const { error } = await db.storageBlocks.delete(id);
      if (error) throw error;
      toast.success('Box deleted');
      setDeleteConfirmBox(null);
      if (selectedPlaceId) await loadPlaceMap(selectedPlaceId);
      if (activeBox?.id === id) {
        setContentsOpen(false);
        setActiveBox(null);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete box');
    }
  };

  const openContents = async (box: StorageBlock) => {
    setActiveBox(box);
    setContentsOpen(true);
    setItemSearch('');
    setAddQty('1');
    setBoxItemsLoading(true);
    try {
      const cached = inventoryCache.get<InventorySlim[]>(CATALOG_CACHE_KEY);
      if (cached?.length) {
        setCatalog(cached.map((c) => ({ id: c.id, product_name: c.product_name, code: c.code })));
      } else {
        const { data, error } = await db.inventory.getAll();
        if (error) throw error;
        setCatalog(
          (data || []).map((c: { id: string; product_name: string; code: string | null }) => ({
            id: c.id,
            product_name: c.product_name,
            code: c.code,
          }))
        );
        inventoryCache.set(CATALOG_CACHE_KEY, data || []);
      }
      const { data: items, error: itemsError } = await db.storageBlockItems.getByBlock(box.id);
      if (itemsError) throw itemsError;
      setBoxItems((items || []) as BlockItem[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load box contents');
    } finally {
      setBoxItemsLoading(false);
    }
  };

  const addItemToBox = async (inv: InventorySlim) => {
    if (!activeBox) return;
    const qty = Math.max(0, parseInt(addQty, 10) || 0);
    const existing = boxItems.find((i) => i.inventory_id === inv.id);
    const nextQty = (existing?.quantity || 0) + (qty || 1);
    try {
      const { data, error } = await db.storageBlockItems.upsert(activeBox.id, inv.id, nextQty);
      if (error) throw error;
      setBoxItems((prev) => {
        const without = prev.filter((i) => i.inventory_id !== inv.id);
        return [...without, data as BlockItem];
      });
      if (selectedPlaceId) {
        const { data: all } = await db.storageBlockItems.getByPlace(selectedPlaceId);
        setPlaceItems((all || []) as BlockItem[]);
      }
      toast.success(`Added ${inv.product_name}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add item');
    }
  };

  const updateItemQty = async (item: BlockItem, quantity: number) => {
    if (quantity < 0) return;
    try {
      if (quantity === 0) {
        const { error } = await db.storageBlockItems.delete(item.id);
        if (error) throw error;
        setBoxItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        const { data, error } = await db.storageBlockItems.updateQuantity(item.id, quantity);
        if (error) throw error;
        setBoxItems((prev) => prev.map((i) => (i.id === item.id ? (data as BlockItem) : i)));
      }
      if (selectedPlaceId) {
        const { data: all } = await db.storageBlockItems.getByPlace(selectedPlaceId);
        setPlaceItems((all || []) as BlockItem[]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update quantity');
    }
  };

  const selectedPlace = places.find((p) => p.id === selectedPlaceId) || null;

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-semibold">
              <MapPin className="w-4 h-4 text-sky-700" />
              Storage Locations
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-500"
                onClick={() => loadPlaces()}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="sm"
                className="h-8 bg-sky-700 hover:bg-sky-800 px-2.5"
                onClick={openCreatePlace}
              >
                <Plus className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Place</span>
              </Button>
            </div>
          </div>

          {/* Quiet search */}
          <div className="relative" ref={whereSuggestRef}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Where is…? Search product"
              value={whereQuery}
              onChange={(e) => {
                setWhereQuery(e.target.value);
                setShowWhereSuggestions(true);
                void ensureWhereCatalog();
              }}
              onFocus={() => {
                setShowWhereSuggestions(true);
                void ensureWhereCatalog();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runWhereSearch();
                }
                if (e.key === 'Escape') setShowWhereSuggestions(false);
              }}
              className={cn(
                'pl-8 h-9 text-sm bg-slate-50 border-slate-200',
                whereQuery ? 'pr-20' : 'pr-16'
              )}
            />
            {whereQuery && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="absolute right-12 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                title="Clear"
                onClick={() => {
                  setWhereQuery('');
                  setWhereResults([]);
                  setShowWhereSuggestions(false);
                }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs text-sky-700"
              onClick={() => void runWhereSearch()}
              disabled={whereSearching}
            >
              {whereSearching ? '…' : 'Find'}
            </Button>
            {showWhereSuggestions && whereSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                {whereSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none border-b last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickWhereSuggestion(item)}
                  >
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {item.product_name}
                    </div>
                    {item.code && (
                      <div className="text-xs text-slate-500 truncate">Code: {item.code}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {whereResults.length > 0 && (
            <ul className="divide-y rounded-md border border-slate-200 bg-white text-sm max-h-40 overflow-y-auto">
              {whereResults.map((r, i) => (
                <li key={`${r.box_name}-${r.product_name}-${i}`} className="px-3 py-2">
                  <span className="font-medium">{r.product_name}</span>
                  {r.code ? <span className="text-slate-500"> ({r.code})</span> : null}
                  <span className="text-slate-500"> × {r.quantity}</span>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {r.place_name} / {r.box_name}
                    {r.parent_box_name ? ` (on ${r.parent_box_name})` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {whereQuery.trim() &&
            !whereSearching &&
            whereResults.length === 0 &&
            !showWhereSuggestions && (
              <p className="text-xs text-slate-500">No locations found for that product.</p>
            )}

          {/* Places — chips + ⋮ */}
          {!placesLoaded && loading ? (
            <p className="text-sm text-slate-500">Loading places…</p>
          ) : places.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              No places yet. Add a place to map boxes.
            </p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
              {places.map((place) => {
                const selected = selectedPlaceId === place.id;
                return (
                  <div
                    key={place.id}
                    className={cn(
                      'flex items-center shrink-0 rounded-full border overflow-hidden',
                      selected
                        ? 'border-sky-700 bg-sky-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700'
                    )}
                  >
                    <button
                      type="button"
                      className="pl-3 pr-1.5 py-1.5 text-xs font-medium max-w-[9rem] truncate"
                      onClick={() => setSelectedPlaceId(place.id)}
                    >
                      {place.name}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-7 w-7 p-0 rounded-full mr-0.5',
                            selected
                              ? 'text-white/80 hover:text-white hover:bg-sky-600'
                              : 'text-slate-400 hover:text-slate-700'
                          )}
                          aria-label={`${place.name} options`}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => openEditPlace(place)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          onClick={() => setDeleteConfirmPlace(place)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPlace && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="px-3 sm:px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base font-semibold truncate">
                  <Layers className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="truncate">{selectedPlace.name}</span>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                  Drag a box onto another to stack
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 shrink-0 bg-sky-700 hover:bg-sky-800"
                onClick={openCreateBox}
              >
                <Plus className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Add box</span>
                <span className="sm:hidden">Box</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-4 pb-3 pt-0">
            {blocks.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center px-4">
                No boxes yet. Add a box, then drag one onto another to stack.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                  setDragLabel(null);
                  setOverBoxId(null);
                  setIsDraggingBox(false);
                }}
              >
                <div className="overflow-x-auto overscroll-x-contain pb-2 px-3 sm:px-0">
                  <div className="flex gap-3 sm:gap-4 items-end min-w-min">
                    {stacks.map((column) => (
                      <StackColumn
                        key={column[0].id}
                        column={column}
                        itemCountByBlock={itemCountByBlock}
                        overBoxId={overBoxId}
                        onOpenContents={openContents}
                        onEdit={openEditBox}
                        onDelete={(box) => setDeleteConfirmBox(box)}
                      />
                    ))}
                    <FloorDropZone active={isDraggingBox} />
                  </div>
                </div>
                <DragOverlay dropAnimation={null}>
                  {dragLabel ? (
                    <div className="rounded-md border bg-white shadow-lg px-4 py-3 text-sm font-semibold cursor-grabbing">
                      {dragLabel}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={placeDialogOpen} onOpenChange={setPlaceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlace ? 'Rename place' : 'New place'}</DialogTitle>
            <DialogDescription>A room or area where you keep boxes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Name</Label>
            <Input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="e.g. Store Room"
              onKeyDown={(e) => e.key === 'Enter' && savePlace()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlaceDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-sky-700 hover:bg-sky-800" disabled={!placeName.trim()} onClick={savePlace}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={boxDialogOpen} onOpenChange={setBoxDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBox ? 'Edit box' : 'New box'}</DialogTitle>
            <DialogDescription>Name the box. Stack it later by dragging onto another box.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Box name</Label>
              <Input
                value={boxName}
                onChange={(e) => setBoxName(e.target.value)}
                placeholder="e.g. Blue Crate"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={boxNotes} onChange={(e) => setBoxNotes(e.target.value)} placeholder="Short note" />
            </div>
            {editingBox && places.length > 1 && (
              <div className="space-y-2">
                <Label>Move to place</Label>
                <Select value={movePlaceId} onValueChange={setMovePlaceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {places.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-sky-700 hover:bg-sky-800" disabled={!boxName.trim()} onClick={saveBox}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmPlace} onOpenChange={(o) => !o && setDeleteConfirmPlace(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete place “{deleteConfirmPlace?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              All boxes in this place will be removed. Main inventory quantities stay the same.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteConfirmPlace) {
                  void deletePlace(deleteConfirmPlace.id);
                  setDeleteConfirmPlace(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirmBox} onOpenChange={(o) => !o && setDeleteConfirmBox(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete box “{deleteConfirmBox?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Contents of this box are removed from the map. Boxes sitting on it become separate stacks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteConfirmBox && deleteBox(deleteConfirmBox.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={contentsOpen} onOpenChange={setContentsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {activeBox?.name || 'Box'}
            </DialogTitle>
            <DialogDescription>What&apos;s inside and how much.</DialogDescription>
          </DialogHeader>

          {boxItemsLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : (
            <div className="space-y-4 py-2">
              {boxItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Empty — add products below.</p>
              ) : (
                <ul className="border rounded-lg divide-y">
                  {boxItems.map((item) => {
                    const inv = inventoryOf(item);
                    return (
                      <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{inv?.product_name || 'Unknown'}</div>
                          {inv?.code && <div className="text-xs text-muted-foreground">{inv.code}</div>}
                        </div>
                        <Input
                          type="number"
                          min={0}
                          className="w-20 h-8"
                          value={item.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isNaN(v)) updateItemQty(item, v);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 shrink-0"
                          onClick={() => updateItemQty(item, 0)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="space-y-2">
                <Label>Add from inventory</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-9"
                      placeholder="Search product…"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                    />
                  </div>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                  />
                </div>
                <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                  {filteredCatalog.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No matching products</p>
                  ) : (
                    filteredCatalog.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium block truncate">{inv.product_name}</span>
                          {inv.code && (
                            <span className="text-xs text-muted-foreground block">{inv.code}</span>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 w-8 shrink-0 bg-sky-700 hover:bg-sky-800"
                          onClick={() => addItemToBox(inv)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setContentsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StorageLocationsMap;
