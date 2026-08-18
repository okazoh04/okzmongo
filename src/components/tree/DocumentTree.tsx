import { useRef, useState } from "react";
import TreeNode from "./TreeNode";
import { joinPath, setAtPath, getAtPath, deleteAtPath } from "../../lib/treePath";
import { inferType, formatDisplayValue } from "../../lib/bsonTypes";
import { flattenTree } from "../../lib/treeFlatten";
import ContextMenu, { type ContextMenuItem } from "../ContextMenu";
import JsonEditDialog from "../JsonEditDialog";
import { TREE_GRID_TEMPLATE } from "./gridLayout";
import { useI18n } from "../../i18n";

interface Props {
  value: Record<string, unknown>;
  onChange?: (next: Record<string, unknown>) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  path: string;
  value: unknown;
}

export default function DocumentTree({ value, onChange, onSave, readOnly = false }: Props) {
  const { t } = useI18n();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [jsonEditPath, setJsonEditPath] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 値編集用inputはコミット後にアンマウントされフォーカスを失うため、
  // Ctrl+Enterでの保存をルート要素側でも拾えるようフォーカスを戻す。
  const refocusRoot = () => {
    requestAnimationFrame(() => rootRef.current?.focus());
  };

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expand = (path: string) => {
    setExpandedPaths((prev) => new Set(prev).add(path));
  };

  const handleCommitEdit = (path: string, newValue: unknown) => {
    const next = setAtPath(value, path, newValue) as Record<string, unknown>;
    onChange?.(next);
    setEditingPath(null);
    refocusRoot();
  };

  const handleCancelEdit = () => {
    setEditingPath(null);
    refocusRoot();
  };

  const handleAddField = (parentPath: string) => {
    const parent = (parentPath ? getAtPath(value, parentPath) : value) as Record<string, unknown>;
    let newKey = "newField";
    let i = 1;
    while (newKey in parent) {
      newKey = `newField${i}`;
      i++;
    }
    const updatedParent = { ...parent, [newKey]: "" };
    const next = parentPath
      ? (setAtPath(value, parentPath, updatedParent) as Record<string, unknown>)
      : updatedParent;
    onChange?.(next);
    expand(parentPath);
    setEditingPath(joinPath(parentPath, newKey));
  };

  const handleAddArrayItem = (parentPath: string) => {
    const parent = getAtPath(value, parentPath) as unknown[];
    const updatedParent = [...parent, ""];
    const next = setAtPath(value, parentPath, updatedParent) as Record<string, unknown>;
    onChange?.(next);
    expand(parentPath);
    setEditingPath(joinPath(parentPath, updatedParent.length - 1));
  };

  const handleDelete = (path: string) => {
    const next = deleteAtPath(value, path) as Record<string, unknown>;
    onChange?.(next);
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, nodeValue: unknown) => {
    setMenu({ x: e.clientX, y: e.clientY, path, value: nodeValue });
  };

  const buildMenuItems = (m: MenuState): ContextMenuItem[] => {
    const type = inferType(m.value);
    const isContainer = type === "object" || type === "array";
    const isRoot = m.path === "";
    const items: ContextMenuItem[] = [];
    if (!isContainer) {
      items.push({
        label: t.ctxCopyValue,
        onClick: () => navigator.clipboard.writeText(formatDisplayValue(m.value)),
      });
    }
    if (!isRoot) {
      const fieldName = m.path.split(/[.[\]]+/).filter(Boolean).pop() ?? "";
      items.push({ label: t.ctxCopyFieldName, onClick: () => navigator.clipboard.writeText(fieldName) });
    }
    items.push({
      label: isRoot ? t.ctxEditJsonRoot : t.ctxEditJson,
      onClick: () => setJsonEditPath(m.path),
    });
    if (isContainer && !readOnly) {
      items.push({
        label: type === "array" ? t.treeAddArrayItem : t.treeAddField,
        onClick: () => (type === "array" ? handleAddArrayItem(m.path) : handleAddField(m.path)),
      });
    }
    if (!isRoot && !readOnly) {
      items.push({ label: t.ctxDelete, danger: true, onClick: () => handleDelete(m.path) });
    }
    return items;
  };

  const jsonEditValue = jsonEditPath === null ? null : jsonEditPath === "" ? value : getAtPath(value, jsonEditPath);
  const flatRows = flattenTree(value, expandedPaths, readOnly);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, path: "", value });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSave?.();
        }
      }}
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        minHeight: "100%",
        outline: "none",
      }}
    >
      {Object.keys(value).length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: TREE_GRID_TEMPLATE,
            columnGap: 6,
            padding: "1px 4px 3px",
            marginBottom: 2,
            borderBottom: "1px solid var(--border)",
            color: "var(--text-muted)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          <span>{t.treeColKey}</span>
          <span>{t.treeColValue}</span>
          <span>{t.treeColType}</span>
          <span />
        </div>
      )}
      {(() => {
        let dataRowIndex = 0;
        return flatRows.map((row) => {
          if (row.kind === "add") {
            return (
              <div
                key={`add:${row.parentPath}`}
                style={{ padding: "2px 4px", paddingLeft: row.depth * 16 + 4 }}
              >
                <button
                  onClick={() =>
                    row.parentType === "array" ? handleAddArrayItem(row.parentPath) : handleAddField(row.parentPath)
                  }
                  style={{ fontSize: 12, padding: "3px 8px", color: "var(--text-sub)", background: "none" }}
                >
                  {row.parentType === "array" ? t.treeAddArrayItem : t.treeAddField}
                </button>
              </div>
            );
          }
          return (
            <TreeNode
              key={row.path}
              path={row.path}
              fieldKey={row.fieldKey}
              value={row.value}
              depth={row.depth}
              rowIndex={dataRowIndex++}
              expanded={expandedPaths.has(row.path)}
              onToggleExpand={toggleExpand}
              editingPath={editingPath}
              onStartEdit={setEditingPath}
              onCommitEdit={handleCommitEdit}
              onSaveNow={() => onSave?.()}
              onCancelEdit={handleCancelEdit}
              onDelete={handleDelete}
              onContextMenu={handleContextMenu}
              readOnly={readOnly}
            />
          );
        });
      })()}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenuItems(menu)} onClose={() => setMenu(null)} />}
      {jsonEditPath !== null && (
        <JsonEditDialog
          title={jsonEditPath === "" ? t.ctxEditJsonRoot : t.ctxEditJson}
          value={jsonEditValue}
          onSave={(parsed) => {
            const next =
              jsonEditPath === ""
                ? (parsed as Record<string, unknown>)
                : (setAtPath(value, jsonEditPath, parsed) as Record<string, unknown>);
            onChange?.(next);
          }}
          onClose={() => setJsonEditPath(null)}
        />
      )}
    </div>
  );
}
