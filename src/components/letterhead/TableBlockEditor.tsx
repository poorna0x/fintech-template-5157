import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

interface TableBlockEditorProps {
  title?: string;
  columns: string[];
  rows: string[][];
  onChange: (next: { title?: string; columns: string[]; rows: string[][] }) => void;
}

/**
 * Dynamic table editor for the letterhead document builder.
 *
 * Supports:
 *   - Editing column header labels (custom names)
 *   - Adding / removing columns (right-most by default)
 *   - Adding / removing rows
 *   - Editing each cell
 *
 * Designed to be controlled — the parent owns the `columns` and `rows` state.
 */
export default function TableBlockEditor({
  title,
  columns,
  rows,
  onChange,
}: TableBlockEditorProps) {
  const updateTitle = (next: string) => {
    onChange({ title: next, columns, rows });
  };

  const updateColumnName = (idx: number, name: string) => {
    const nextColumns = columns.slice();
    nextColumns[idx] = name;
    onChange({ title, columns: nextColumns, rows });
  };

  const addColumn = () => {
    const nextColumns = [...columns, `Column ${columns.length + 1}`];
    const nextRows = rows.map((row) => [...row, '']);
    onChange({ title, columns: nextColumns, rows: nextRows });
  };

  const removeColumn = (idx: number) => {
    if (columns.length <= 1) return;
    const nextColumns = columns.filter((_, i) => i !== idx);
    const nextRows = rows.map((row) => row.filter((_, i) => i !== idx));
    onChange({ title, columns: nextColumns, rows: nextRows });
  };

  const addRow = () => {
    const blank = columns.map(() => '');
    onChange({ title, columns, rows: [...rows, blank] });
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    onChange({ title, columns, rows: rows.filter((_, i) => i !== idx) });
  };

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    const nextRows = rows.map((row, ri) =>
      ri === rowIdx ? row.map((cell, ci) => (ci === colIdx ? value : cell)) : row
    );
    onChange({ title, columns, rows: nextRows });
  };

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-end gap-2 border-b bg-gray-50 px-3 py-2">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-gray-600">Table Title (optional)</Label>
          <Input
            value={title || ''}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder="e.g. Parts Replaced"
            className="h-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addColumn}
          className="h-8"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Column
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="h-8"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Row
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="border-b border-r border-gray-200 px-2 py-1.5 align-top"
                >
                  <div className="flex items-center gap-1">
                    <Input
                      value={col}
                      onChange={(e) => updateColumnName(idx, e.target.value)}
                      placeholder={`Column ${idx + 1}`}
                      className="h-7 font-semibold text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeColumn(idx)}
                      disabled={columns.length <= 1}
                      title="Remove column"
                      className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </th>
              ))}
              <th className="w-10 border-b border-gray-200" aria-hidden></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-white even:bg-gray-50/50">
                {columns.map((_, ci) => (
                  <td
                    key={ci}
                    className="border-b border-r border-gray-100 px-1 py-1 align-top"
                  >
                    <Input
                      value={row[ci] || ''}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className="h-7 text-xs"
                    />
                  </td>
                ))}
                <td className="border-b border-gray-100 px-1 py-1 align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(ri)}
                    disabled={rows.length <= 1}
                    title="Remove row"
                    className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
