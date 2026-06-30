import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import DocumentEditor from "./DocumentEditor";

interface Props {
  connectionId: string;
  db: string;
  collection: string;
  filterJson: string;
}

const PAGE_SIZE = 50;

export default function DocumentList({ connectionId, db, collection, filterJson }: Props) {
  const [docs, setDocs] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<Record<string, unknown> | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [ioStatus, setIoStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetched, cnt] = await Promise.all([
        invoke<Record<string, unknown>[]>("find_documents", {
          connectionId,
          dbName: db,
          collectionName: collection,
          filterJson,
          skip: page * PAGE_SIZE,
          limit: PAGE_SIZE,
        }),
        invoke<number>("count_documents", {
          connectionId,
          dbName: db,
          collectionName: collection,
          filterJson,
        }),
      ]);
      setDocs(fetched);
      setTotal(cnt);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId, db, collection, filterJson, page]);

  useEffect(() => {
    setPage(0);
  }, [connectionId, db, collection, filterJson]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("このドキュメントを削除しますか？")) return;
    try {
      await invoke("delete_document", { connectionId, dbName: db, collectionName: collection, id });
      load();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleExport = async () => {
    setIoStatus(null);
    try {
      const json: string = await invoke("export_collection", {
        connectionId,
        dbName: db,
        collectionName: collection,
      });
      const path = await save({
        defaultPath: `${collection}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await writeTextFile(path, json);
        setIoStatus({ msg: `エクスポート完了: ${path}`, ok: true });
      }
    } catch (e) {
      setIoStatus({ msg: String(e), ok: false });
    }
  };

  const handleImport = async () => {
    setIoStatus(null);
    try {
      const path = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!path) return;
      const jsonData = await readTextFile(path as string);
      const count: number = await invoke("import_collection", {
        connectionId,
        dbName: db,
        collectionName: collection,
        jsonData,
      });
      setIoStatus({ msg: `インポート完了: ${count.toLocaleString()} 件追加`, ok: true });
      load();
    } catch (e) {
      setIoStatus({ msg: String(e), ok: false });
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* ツールバー */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg2)",
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <span style={{ color: "var(--text-sub)", fontSize: 12, minWidth: 60 }}>
          {loading ? "読込中..." : `${total.toLocaleString()} 件`}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNew(true)} className="primary" style={{ fontSize: 11 }}>+ 追加</button>
        <button onClick={load} style={{ fontSize: 11 }}>↺ 更新</button>
        <span style={{ color: "var(--border)" }}>|</span>
        <button onClick={handleExport} style={{ fontSize: 11 }}>⬇ エクスポート</button>
        <button onClick={handleImport} style={{ fontSize: 11 }}>⬆ インポート</button>
      </div>

      {/* エラー / IO状態 */}
      {error && (
        <div style={{ background: "var(--red)", color: "var(--bg3)", padding: "5px 12px", fontSize: 12, flexShrink: 0 }}>
          {error}
        </div>
      )}
      {ioStatus && (
        <div style={{
          background: ioStatus.ok ? "var(--green)" : "var(--red)",
          color: "var(--bg3)",
          padding: "5px 12px",
          fontSize: 12,
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>{ioStatus.msg}</span>
          <button onClick={() => setIoStatus(null)} style={{ background: "none", fontSize: 11, color: "var(--bg3)" }}>✕</button>
        </div>
      )}

      {/* ドキュメント一覧 */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {docs.map((doc, i) => {
          const id = doc._id as string | undefined;
          return (
            <div
              key={id ?? i}
              style={{
                borderBottom: "1px solid var(--border)",
                padding: "8px 12px",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <pre style={{
                flex: 1,
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontSize: 11,
                color: "var(--text)",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}>
                {JSON.stringify(doc, null, 2)}
              </pre>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <button onClick={() => setEditDoc(doc)} style={{ fontSize: 11, padding: "3px 8px" }}>
                  編集
                </button>
                {id && (
                  <button
                    onClick={() => handleDelete(id)}
                    style={{ fontSize: 11, padding: "3px 8px", color: "var(--red)" }}
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {docs.length === 0 && !loading && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
            ドキュメントがありません
          </div>
        )}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg2)",
          flexShrink: 0,
        }}>
          <button onClick={() => setPage(0)} disabled={page === 0}>|◀</button>
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 0}>◀</button>
          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>
            {page + 1} / {totalPages}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>▶</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>▶|</button>
        </div>
      )}

      {editDoc && (
        <DocumentEditor
          connectionId={connectionId}
          db={db}
          collection={collection}
          initialDoc={editDoc}
          onSaved={() => { setEditDoc(null); load(); }}
          onClose={() => setEditDoc(null)}
        />
      )}

      {showNew && (
        <DocumentEditor
          connectionId={connectionId}
          db={db}
          collection={collection}
          initialDoc={{}}
          isNew
          onSaved={() => { setShowNew(false); load(); }}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
