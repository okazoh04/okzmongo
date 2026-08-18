import { useState } from "react";
import {
  inferType,
  formatDisplayValue,
  formatJsonPreview,
  coerceType,
  unwrapValue,
  type BsonTypeTag,
} from "../../lib/bsonTypes";
import TypeBadge from "./TypeBadge";
import ValueEditor from "./ValueEditor";
import { TREE_GRID_TEMPLATE } from "./gridLayout";
import { useI18n } from "../../i18n";

export interface TreeNodeProps {
  path: string;
  fieldKey: string;
  value: unknown;
  depth: number;
  /** 表示中のデータ行のみを数えた通し番号（縞模様の判定に使用。配列インデックス由来の不変値） */
  rowIndex: number;
  expanded: boolean;
  editingPath: string | null;
  onToggleExpand: (path: string) => void;
  onStartEdit: (path: string) => void;
  onCommitEdit: (path: string, newValue: unknown) => void;
  onSaveNow: () => void;
  onCancelEdit: () => void;
  onDelete: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, value: unknown) => void;
  readOnly?: boolean;
}

export default function TreeNode(props: TreeNodeProps) {
  const {
    path,
    fieldKey,
    value,
    depth,
    rowIndex,
    expanded,
    editingPath,
    onToggleExpand,
    onStartEdit,
    onCommitEdit,
    onSaveNow,
    onCancelEdit,
    onDelete,
    onContextMenu,
    readOnly,
  } = props;
  const { t } = useI18n();
  const type = inferType(value);
  const isContainer = type === "object" || type === "array";
  const isEditing = editingPath === path;
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

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
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: TREE_GRID_TEMPLATE,
        alignItems: "center",
        columnGap: 6,
        padding: "2px 4px",
        cursor: isContainer ? "pointer" : "default",
        background: rowIndex % 2 === 1 ? "rgba(255, 255, 255, 0.035)" : "transparent",
      }}
      onClick={() => isContainer && onToggleExpand(path)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, path, value);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: depth * 16, minWidth: 0 }}>
        <span style={{ width: 12, color: "var(--text-muted)", flexShrink: 0 }}>
          {isContainer ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span style={{ color: "var(--text-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fieldKey}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {!isContainer && isEditing ? (
          <ValueEditor
            type={type}
            initialRaw={unwrapValue(value)}
            onCommit={applyRaw}
            onSaveNow={onSaveNow}
            onCancel={onCancelEdit}
          />
        ) : (
          <span
            onClick={(e) => {
              if (!isContainer && !readOnly) {
                e.stopPropagation();
                onStartEdit(path);
              }
            }}
            title={isContainer ? formatJsonPreview(value) : formatDisplayValue(value)}
            style={{
              color: isContainer ? "var(--text-muted)" : "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
              cursor: !isContainer && !readOnly ? "text" : undefined,
            }}
          >
            {isContainer ? formatJsonPreview(value) : formatDisplayValue(value)}
          </span>
        )}
        {error && <span style={{ color: "var(--red)", fontSize: 11 }}>{error}</span>}
      </div>
      <div>
        <TypeBadge type={type} onChangeType={readOnly ? undefined : applyType} readOnly={readOnly} />
      </div>
      <div>
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
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
