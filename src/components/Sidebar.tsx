import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, SelectedItem, defaultConnection } from "../types";
import { ConnectionForm } from "./ConnectionForm";

interface Props {
  connections: ConnectionConfig[];
  connectedIds: string[];
  selected: SelectedItem | null;
  onSelect: (item: SelectedItem) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRefresh: () => void;
}

export default function Sidebar({
  connections,
  connectedIds,
  selected,
  onSelect,
  onConnect,
  onDisconnect,
  onRefresh,
}: Props) {
  const [expandedDbs, setExpandedDbs] = useState<Record<string, Set<string>>>({});
  const [collections, setCollections] = useState<Record<string, string[]>>({});
  const [databases, setDatabases] = useState<Record<string, string[]>>({});
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connError, setConnError] = useState<Record<string, string>>({});
  const [editTarget, setEditTarget] = useState<"new" | string | null>(null);

  // 接続が増えたら自動でDBリストを読む
  useEffect(() => {
    for (const id of connectedIds) {
      if (!databases[id]) loadDatabases(id);
    }
  }, [connectedIds]);

  const loadDatabases = async (connectionId: string) => {
    try {
      const dbs: string[] = await invoke("list_databases", { connectionId });
      setDatabases(d => ({ ...d, [connectionId]: dbs }));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleDb = async (connectionId: string, db: string) => {
    const key = `${connectionId}::${db}`;
    setExpandedDbs(prev => {
      const next = { ...prev };
      const set = new Set(next[connectionId] ?? []);
      if (set.has(db)) {
        set.delete(db);
      } else {
        set.add(db);
      }
      next[connectionId] = set;
      return next;
    });
    if (!collections[key]) {
      try {
        const cols: string[] = await invoke("list_collections", { connectionId, dbName: db });
        setCollections(c => ({ ...c, [key]: cols }));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const refreshCollections = async (connectionId: string, db: string) => {
    const key = `${connectionId}::${db}`;
    try {
      const cols: string[] = await invoke("list_collections", { connectionId, dbName: db });
      setCollections(c => ({ ...c, [key]: cols }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleConnect = async (id: string) => {
    setConnecting(id);
    setConnError(e => ({ ...e, [id]: "" }));
    try {
      await invoke("connect", { id });
      onConnect(id);
    } catch (e) {
      setConnError(prev => ({ ...prev, [id]: String(e) }));
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    await invoke("disconnect", { id });
    setDatabases(d => { const n = { ...d }; delete n[id]; return n; });
    setExpandedDbs(d => { const n = { ...d }; delete n[id]; return n; });
    onDisconnect(id);
  };

  const handleSave = async (cfg: Omit<ConnectionConfig, "id"> & { id?: string }) => {
    if (cfg.id) {
      await invoke("update_connection", { config: cfg });
    } else {
      await invoke("add_connection", { config: cfg });
    }
    setEditTarget(null);
    onRefresh();
  };

  const handleRemove = async (id: string) => {
    if (!confirm("この接続設定を削除しますか？")) return;
    await invoke("remove_connection", { id });
    onRefresh();
  };

  const handleCreateCollection = async (connectionId: string, db: string, name: string) => {
    await invoke("create_collection", { connectionId, dbName: db, collectionName: name });
    await refreshCollections(connectionId, db);
  };

  const handleDropCollection = async (connectionId: string, db: string, col: string) => {
    if (!confirm(`コレクション "${col}" を削除しますか？`)) return;
    await invoke("drop_collection", { connectionId, dbName: db, collectionName: col });
    await refreshCollections(connectionId, db);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ヘッダー */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "8px 10px", borderBottom: "1px solid var(--border)",
        background: "var(--bg3)", flexShrink: 0,
      }}>
        <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 12, flex: 1 }}>接続</span>
        <button
          onClick={() => setEditTarget("new")}
          style={{ fontSize: 11, padding: "2px 8px" }}
          className="primary"
        >
          + 追加
        </button>
      </div>

      {/* 接続フォーム（インライン） */}
      {editTarget !== null && (
        <div style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg2)",
          padding: 10,
          overflow: "auto",
          flexShrink: 0,
          maxHeight: "60vh",
        }}>
          <div style={{ color: "var(--accent2)", fontWeight: 600, fontSize: 12, marginBottom: 8 }}>
            {editTarget === "new" ? "新規接続" : "接続を編集"}
          </div>
          <ConnectionForm
            initial={
              editTarget === "new"
                ? defaultConnection()
                : connections.find(c => c.id === editTarget) ?? defaultConnection()
            }
            onSave={handleSave}
            onCancel={() => setEditTarget(null)}
          />
        </div>
      )}

      {/* ツリー */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {connections.map(conn => {
          const isConnected = connectedIds.includes(conn.id);
          const dbs = databases[conn.id] ?? [];
          const expandedSet = expandedDbs[conn.id] ?? new Set<string>();

          return (
            <div key={conn.id}>
              {/* 接続行 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 8px",
                background: "var(--bg2)",
                borderBottom: "1px solid var(--border)",
              }}>
                <span style={{ fontSize: 9, color: isConnected ? "var(--green)" : "var(--text-muted)" }}>
                  {isConnected ? "●" : "○"}
                </span>
                <span style={{
                  flex: 1, fontSize: 12, fontWeight: 600,
                  color: isConnected ? "var(--text)" : "var(--text-muted)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {conn.name}
                </span>
                {isConnected ? (
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    style={{ fontSize: 10, padding: "1px 5px", color: "var(--red)", flexShrink: 0 }}
                  >
                    切断
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(conn.id)}
                    disabled={connecting === conn.id}
                    style={{ fontSize: 10, padding: "1px 5px", flexShrink: 0 }}
                    className="primary"
                  >
                    {connecting === conn.id ? "…" : "接続"}
                  </button>
                )}
                <button
                  onClick={() => setEditTarget(conn.id)}
                  style={{ fontSize: 10, padding: "1px 5px", flexShrink: 0 }}
                  title="編集"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleRemove(conn.id)}
                  style={{ fontSize: 10, padding: "1px 5px", color: "var(--red)", flexShrink: 0 }}
                  title="削除"
                >
                  ✕
                </button>
              </div>

              {/* エラー */}
              {connError[conn.id] && (
                <div style={{ background: "var(--red)", color: "var(--bg3)", fontSize: 10, padding: "3px 10px" }}>
                  {connError[conn.id]}
                </div>
              )}

              {/* DB ツリー */}
              {isConnected && (
                <div style={{ paddingLeft: 8 }}>
                  {dbs.length === 0 && (
                    <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "4px 8px" }}>
                      読込中...
                    </div>
                  )}
                  {dbs.map(db => {
                    const isExpanded = expandedSet.has(db);
                    const colKey = `${conn.id}::${db}`;
                    const cols = collections[colKey] ?? [];

                    return (
                      <DbNode
                        key={db}
                        db={db}
                        isExpanded={isExpanded}
                        collections={cols}
                        onToggle={() => toggleDb(conn.id, db)}
                        onSelectCollection={col => onSelect({ connectionId: conn.id, db, collection: col })}
                        selectedCollection={
                          selected?.connectionId === conn.id && selected.db === db
                            ? selected.collection
                            : null
                        }
                        onCreateCollection={name => handleCreateCollection(conn.id, db, name)}
                        onDropCollection={col => handleDropCollection(conn.id, db, col)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {connections.length === 0 && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px 8px", fontSize: 11 }}>
            「+ 追加」から接続先を登録してください
          </div>
        )}
      </div>
    </div>
  );
}

function DbNode({
  db, isExpanded, collections, onToggle, onSelectCollection,
  selectedCollection, onCreateCollection, onDropCollection,
}: {
  db: string;
  isExpanded: boolean;
  collections: string[];
  onToggle: () => void;
  onSelectCollection: (col: string) => void;
  selectedCollection: string | null;
  onCreateCollection: (name: string) => void;
  onDropCollection: (col: string) => void;
}) {
  const [newColName, setNewColName] = useState("");
  const [showInput, setShowInput] = useState(false);

  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 6px", cursor: "pointer", borderRadius: 3,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)", width: 10 }}>
          {isExpanded ? "▾" : "▸"}
        </span>
        <span style={{ color: "var(--yellow)", fontSize: 12 }}>{db}</span>
      </div>

      {isExpanded && (
        <div style={{ paddingLeft: 16 }}>
          {collections.map(col => (
            <div
              key={col}
              onClick={() => onSelectCollection(col)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "2px 6px", cursor: "pointer", borderRadius: 3,
                background: selectedCollection === col ? "var(--surface2)" : "transparent",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {col}
              </span>
              <button
                onClick={e => { e.stopPropagation(); onDropCollection(col); }}
                style={{ fontSize: 9, padding: "0 3px", color: "var(--text-muted)", background: "none", opacity: 0.5 }}
                title="削除"
              >
                ✕
              </button>
            </div>
          ))}

          {showInput ? (
            <div style={{ display: "flex", gap: 3, padding: "2px 0" }}>
              <input
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                placeholder="コレクション名"
                style={{ flex: 1, fontSize: 11 }}
                onKeyDown={e => {
                  if (e.key === "Enter" && newColName.trim()) {
                    onCreateCollection(newColName.trim());
                    setNewColName("");
                    setShowInput(false);
                  }
                  if (e.key === "Escape") setShowInput(false);
                }}
                autoFocus
              />
              <button onClick={() => setShowInput(false)} style={{ fontSize: 10 }}>✕</button>
            </div>
          ) : (
            <div
              onClick={() => setShowInput(true)}
              style={{ color: "var(--text-muted)", fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
            >
              + コレクション
            </div>
          )}
        </div>
      )}
    </div>
  );
}
