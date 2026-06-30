import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, SelectedItem } from "./types";
import Sidebar from "./components/Sidebar";
import DocumentList from "./components/DocumentList";

export default function App() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [filterJson, setFilterJson] = useState("{}");
  const [filterInput, setFilterInput] = useState("{}");

  const loadConnections = async () => {
    const conns: ConnectionConfig[] = await invoke("list_connections");
    setConnections(conns);
  };

  const loadConnectedIds = async () => {
    const ids: string[] = await invoke("list_connected_ids");
    setConnectedIds(ids);
  };

  useEffect(() => {
    loadConnections();
    loadConnectedIds();
  }, []);

  const handleConnect = (id: string) => {
    setConnectedIds(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const handleDisconnect = (id: string) => {
    setConnectedIds(prev => prev.filter(x => x !== id));
    if (selected?.connectionId === id) setSelected(null);
  };

  const handleSelect = (item: SelectedItem) => {
    setSelected(item);
    setFilterInput("{}");
    setFilterJson("{}");
  };

  const activeConn = selected
    ? connections.find(c => c.id === selected.connectionId)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* タイトルバー */}
      <div style={{
        background: "var(--bg3)",
        borderBottom: "1px solid var(--border)",
        padding: "5px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, color: "var(--accent2)", fontSize: 14 }}>OkzMongo</span>
        {activeConn && selected && (
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            <span style={{ color: "var(--green)" }}>{activeConn.name}</span>
            <span style={{ margin: "0 4px" }}>▸</span>
            <span style={{ color: "var(--yellow)" }}>{selected.db}</span>
            <span style={{ margin: "0 4px" }}>▸</span>
            <span>{selected.collection}</span>
          </span>
        )}
      </div>

      {/* ボディ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* サイドバー */}
        <div style={{
          width: 260,
          borderRight: "1px solid var(--border)",
          background: "var(--bg2)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <Sidebar
            connections={connections}
            connectedIds={connectedIds}
            selected={selected}
            onSelect={handleSelect}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onRefresh={loadConnections}
          />
        </div>

        {/* メインエリア */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selected ? (
            <>
              {/* フィルタバー */}
              <div style={{
                padding: "7px 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg2)",
                flexShrink: 0,
                display: "flex",
                gap: 6,
              }}>
                <input
                  value={filterInput}
                  onChange={e => setFilterInput(e.target.value)}
                  placeholder='{"field": "value"}'
                  style={{ flex: 1, fontFamily: "monospace" }}
                  onKeyDown={e => e.key === "Enter" && setFilterJson(filterInput)}
                />
                <button className="primary" onClick={() => setFilterJson(filterInput)}>検索</button>
                <button onClick={() => { setFilterInput("{}"); setFilterJson("{}"); }}>クリア</button>
              </div>

              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <DocumentList
                  connectionId={selected.connectionId}
                  db={selected.db}
                  collection={selected.collection}
                  filterJson={filterJson}
                />
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}>
              左のサイドバーから接続してコレクションを選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
