import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, SelectedItem } from "./types";
import { useI18n, LOCALES } from "./i18n";
import Sidebar from "./components/Sidebar";
import DocumentList from "./components/DocumentList";
import About from "./components/About";

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [filterJson, setFilterJson] = useState("{}");
  const [filterInput, setFilterInput] = useState("{}");
  const [showAbout, setShowAbout] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

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
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowAbout(true)}
          style={{ fontSize: 11, padding: "2px 8px", opacity: 0.7 }}
          title={t.about}
        >?</button>
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
                <button className="primary" onClick={() => setFilterJson(filterInput)}>{t.search}</button>
                <button onClick={() => { setFilterInput("{}"); setFilterJson("{}"); }}>{t.clear}</button>
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
              {t.selectCollection}
            </div>
          )}
        </div>
      </div>

      {/* ステータスバー */}
      <div style={{
        background: "var(--bg3)",
        borderTop: "1px solid var(--border)",
        height: 24,
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        flexShrink: 0,
        position: "relative",
      }}>
        <button
          onClick={() => setShowLangPicker(p => !p)}
          title={t.langLabel}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, padding: "0 4px", color: "var(--text-muted)", lineHeight: 1,
          }}
        >🌐</button>
        {showLangPicker && (
          <>
            <div
              onClick={() => setShowLangPicker(false)}
              style={{ position: "fixed", inset: 0, zIndex: 99 }}
            />
            <div style={{
              position: "absolute",
              bottom: 28,
              left: 0,
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
              zIndex: 100,
              minWidth: 160,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}>
              {LOCALES.map(l => (
                <button
                  key={l.value}
                  onClick={() => { setLocale(l.value); setShowLangPicker(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "6px 16px",
                    background: l.value === locale ? "var(--accent)" : "none",
                    color: l.value === locale ? "white" : "var(--text)",
                    border: "none", cursor: "pointer", fontSize: 13,
                  }}
                >{l.label}</button>
              ))}
            </div>
          </>
        )}
      </div>
      {showAbout && <About onClose={() => setShowAbout(false)} />}
    </div>
  );
}
