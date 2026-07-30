import { useState } from "react";
import {
  inferType,
  formatDisplayValue,
  coerceType,
  unwrapValue,
  type BsonTypeTag,
} from "../../lib/bsonTypes";
import { joinPath } from "../../lib/treePath";
import TypeBadge from "./TypeBadge";
import ValueEditor from "./ValueEditor";
import { useI18n } from "../../i18n";

export interface TreeNodeProps {
  path: string;
  fieldKey: string;
  value: unknown;
  depth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  editingPath: string | null;
  onStartEdit: (path: string) => void;
  onCommitEdit: (path: string, newValue: unknown) => void;
  onSaveNow: () => void;
  onCancelEdit: () => void;
  onAddField: (parentPath: string) => void;
  onAddArrayItem: (parentPath: string) => void;
  onDelete: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, value: unknown) => void;
  readOnly?: boolean;
}

interface ChildEntry {
  key: string | number;
  value: unknown;
}

function getChildren(type: string, value: unknown): ChildEntry[] {
  if (type === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, v]) => ({ key, value: v }));
  }
  if (type === "array") {
    return (value as unknown[]).map((v, i) => ({ key: i, value: v }));
  }
  return [];
}

export default function TreeNode(props: TreeNodeProps) {
  const {
    path,
    fieldKey,
    value,
    depth,
    expandedPaths,
    onToggleExpand,
    editingPath,
    onStartEdit,
    onCommitEdit,
    onSaveNow,
    onCancelEdit,
    onAddField,
    onAddArrayItem,
    onDelete,
    onContextMenu,
    readOnly,
  } = props;
  const { t } = useI18n();
  const type = inferType(value);
  const isContainer = type === "object" || type === "array";
  const expanded = expandedPaths.has(path);
  const isEditing = editingPath === path;
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const children = isContainer ? getChildren(type, value) : [];

  const applyRaw = (raw: unknown) => {
    const result = coerceType(raw, type);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onCommitEdit(path, result.value);
  };

  const applyType = (newType: BsonTypeTag) => {
    const result = coerceType(value, newType);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onCommitEdit(path, result.value);
  };

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: depth * 16 + 4,
          padding: "2px 4px",
          cursor: isContainer ? "pointer" : "default",
        }}
        onClick={() => isContainer && onToggleExpand(path)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, path, value);
        }}
      >
        <span style={{ width: 12, color: "var(--text-muted)", flexShrink: 0 }}>
          {isContainer ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span style={{ color: "var(--text-sub)" }}>{fieldKey}</span>
        <TypeBadge type={type} onChangeType={readOnly ? undefined : applyType} readOnly={readOnly} />
        {!isContainer && isEditing ? (
          <ValueEditor
            type={type}
            initialRaw={unwrapValue(value)}
            onCommit={applyRaw}
            onSaveNow={onSaveNow}
            onCancel={onCancelEdit}
          />
        ) : (
          (!isContainer || !expanded) && (
            <span
              onClick={(e) => {
                if (!isContainer && !readOnly) {
                  e.stopPropagation();
                  onStartEdit(path);
                }
              }}
              style={{
                color: isContainer ? "var(--text-muted)" : "var(--text)",
                wordBreak: "break-all",
                cursor: !isContainer && !readOnly ? "text" : undefined,
              }}
            >
              {formatDisplayValue(value)}
            </span>
          )
        )}
        {error && <span style={{ color: "var(--red)", fontSize: 11 }}>{error}</span>}
        {!readOnly && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(path);
            }}
            title={t.treeDeleteField}
            style={{
              fontSize: 12,
              padding: "3px 8px",
              color: "var(--red)",
              background: "none",
              opacity: hover ? 1 : 0.4,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>
      {isContainer && expanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.key}
              path={joinPath(path, child.key)}
              fieldKey={typeof child.key === "number" ? `[${child.key}]` : child.key}
              value={child.value}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              editingPath={editingPath}
              onStartEdit={onStartEdit}
              onCommitEdit={onCommitEdit}
              onSaveNow={onSaveNow}
              onCancelEdit={onCancelEdit}
              onAddField={onAddField}
              onAddArrayItem={onAddArrayItem}
              onDelete={onDelete}
              onContextMenu={onContextMenu}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && (
            <div style={{ paddingLeft: (depth + 1) * 16 + 4, padding: "2px 4px" }}>
              <button
                onClick={() => (type === "array" ? onAddArrayItem(path) : onAddField(path))}
                style={{ fontSize: 12, padding: "3px 8px", color: "var(--text-sub)", background: "none" }}
              >
                {type === "array" ? t.treeAddArrayItem : t.treeAddField}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
