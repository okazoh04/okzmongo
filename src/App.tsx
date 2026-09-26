import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, SelectedItem } from "./types";
import { useI18n, LOCALES } from "./i18n";
import Sidebar from "./components/Sidebar";
import DocumentList from "./components/DocumentList";
import QueryPad from "./components/QueryPad";
import About from "./components/About";
import PolicySettings from "./components/PolicySettings";
import { ENV_COLOR } from "./policy";

const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 600;

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [filterJson, setFilterJson] = useState("{}");
  const [filterInput, setFilterInput] = useState("{}");
  const [activeTab, setActiveTab] = useState<"documents" | "query">("documents");
  const [showAbout, setShowAbout] = useState(false);
  const [showPolicySettings, setShowPolicySettings] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem("okzmongo-sidebar-width"));
    return saved >= SIDEBAR_MIN_WIDTH && saved <= SIDEBAR_MAX_WIDTH ? saved : 260;
  });
  const isResizingSidebar = useRef(false);

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebar.current) return;
      const width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX));
      setSidebarWidth(width);
    };
    const handleMouseUp = () => {
      if (!isResizingSidebar.current) return;
      isResizingSidebar.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSidebarWidth(w => {
        localStorage.setItem("okzmongo-sidebar-width", String(w));
        return w;
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleSidebarResizeStart = () => {
    isResizingSidebar.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

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
    // DBレベル選択時はクエリタブ、コレクション選択時はドキュメントタブへ
    setActiveTab(item.collection === null ? "query" : "documents");
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
        <span style={{ fontWeight: 700, color: "var(--accent2)", fontSize: 14 }}>okzMongo</span>
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
          onClick={() => setShowPolicySettings(true)}
          style={{ fontSize: 16, padding: "3px 9px", opacity: 0.7 }}
          title={t.policySettingsTitle}
        >⚙️</button>
        <button
          onClick={() => setShowAbout(true)}
          style={{ fontSize: 13, padding: "3px 10px", opacity: 0.7 }}
          title={t.about}
        >?</button>
      </div>

      {/* ボディ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* サイドバー */}
        <div style={{
          width: sidebarWidth,
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

        {/* サイドバー幅リサイズハンドル */}
        <div
          onMouseDown={handleSidebarResizeStart}
          style={{
            width: 5,
            marginLeft: -2.5,
            marginRight: -2.5,
            cursor: "col-resize",
            flexShrink: 0,
            zIndex: 1,
            position: "relative",
          }}
        />

        {/* メインエリア（上端の帯で接続の環境種別を色で示す） */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
          borderTop: `4px solid ${activeConn ? ENV_COLOR[activeConn.environment] : "transparent"}`,
        }}>
          {selected ? (
            <>
              {/* タブバー（コレクション選択時のみ両タブ表示、DBレベルはクエリのみ） */}
              <div style={{
                display: "flex",
                alignItems: "center",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg2)",
                flexShrink: 0,
              }}>
                {selected.collection !== null && (
                  <>
                    <button
                      onClick={() => setActiveTab("documents")}
                      style={{
                        fontSize: 13, padding: "8px 18px", border: "none", borderRadius: 0,
                        borderBottom: activeTab === "documents" ? "2px solid var(--accent)" : "2px solid transparent",
                        background: "none",
                        color: activeTab === "documents" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >{t.documents}</button>
                    <button
                      onClick={() => setActiveTab("query")}
                      style={{
                        fontSize: 13, padding: "8px 18px", border: "none", borderRadius: 0,
                        borderBottom: activeTab === "query" ? "2px solid var(--accent)" : "2px solid transparent",
                        background: "none",
                        color: activeTab === "query" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >{t.queryPad}</button>
                  </>
                )}
                {selected.collection === null && (
                  <span style={{ padding: "6px 16px", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                    {t.queryPad}
                  </span>
                )}

                {/* ドキュメントタブのフィルタ入力 */}
                {activeTab === "documents" && selected.collection !== null && (
                  <div style={{ flex: 1, display: "flex", gap: 6, padding: "4px 12px 4px 4px" }}>
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
                )}
              </div>

              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {activeTab === "documents" && selected.collection !== null ? (
                  <DocumentList
                    connectionId={selected.connectionId}
                    db={selected.db}
                    collection={selected.collection}
                    filterJson={filterJson}
                    environment={activeConn?.environment ?? "development"}
                  />
                ) : (
                  <QueryPad
                    connectionId={selected.connectionId}
                    db={selected.db}
                    initialQuery={selected.collection ? `db.${selected.collection}.find({})` : undefined}
                    environment={activeConn?.environment ?? "development"}
                  />
                )}
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
      {showPolicySettings && <PolicySettings onClose={() => setShowPolicySettings(false)} />}
    </div>
  );
}
