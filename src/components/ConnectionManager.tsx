import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, AuthConfig, TlsConfig, SshConfig, defaultConnection } from "../types";

interface Props {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  onRefresh: () => void;
  onConnect: (id: string) => void;
  onDisconnect: () => void;
}

type EditTarget = "new" | string;

const inputStyle: React.CSSProperties = { width: "100%", marginBottom: 4 };
const labelStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: 11, display: "block", marginBottom: 2 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "var(--accent)", fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, marginBottom: 6 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ConnectionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<ConnectionConfig, "id"> & { id?: string };
  onSave: (c: Omit<ConnectionConfig, "id"> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState(initial);
  const set = (patch: Partial<typeof cfg>) => setCfg(c => ({ ...c, ...patch }));

  const hasAuth = cfg.auth !== null;
  const hasTls = cfg.tls !== null;
  const hasSsh = cfg.ssh !== null;

  const toggleAuth = (on: boolean) =>
    set({ auth: on ? { username: "", password: "", auth_db: "admin" } : null });
  const toggleTls = (on: boolean) =>
    set({ tls: on ? { enabled: true, ca_file: null, cert_key_file: null, allow_invalid_certs: false } : null });
  const toggleSsh = (on: boolean) =>
    set({ ssh: on ? { enabled: true, host: "", port: 22, username: "", password: null, key_file: null } : null });

  const setAuth = (patch: Partial<AuthConfig>) =>
    set({ auth: { ...cfg.auth!, ...patch } });
  const setTls = (patch: Partial<TlsConfig>) =>
    set({ tls: { ...cfg.tls!, ...patch } });
  const setSsh = (patch: Partial<SshConfig>) =>
    set({ ssh: { ...cfg.ssh!, ...patch } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 2px" }}>
      <Section title="基本">
        <label style={labelStyle}>接続名</label>
        <input style={inputStyle} value={cfg.name} onChange={e => set({ name: e.target.value })} placeholder="My MongoDB" />
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 3 }}>
            <label style={labelStyle}>ホスト</label>
            <input style={{ width: "100%" }} value={cfg.host} onChange={e => set({ host: e.target.value })} placeholder="localhost" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>ポート</label>
            <input style={{ width: "100%" }} type="number" value={cfg.port} onChange={e => set({ port: parseInt(e.target.value) || 27017 })} />
          </div>
        </div>
      </Section>

      <Section title="認証">
        <Toggle label="認証を使用" checked={hasAuth} onChange={toggleAuth} />
        {hasAuth && (
          <>
            <label style={labelStyle}>ユーザー名</label>
            <input style={inputStyle} value={cfg.auth!.username} onChange={e => setAuth({ username: e.target.value })} />
            <label style={labelStyle}>パスワード</label>
            <input style={inputStyle} type="password" value={cfg.auth!.password} onChange={e => setAuth({ password: e.target.value })} />
            <label style={labelStyle}>認証DB (デフォルト: admin)</label>
            <input style={inputStyle} value={cfg.auth!.auth_db} onChange={e => setAuth({ auth_db: e.target.value })} placeholder="admin" />
          </>
        )}
      </Section>

      <Section title="SSL / TLS">
        <Toggle label="TLS を有効化" checked={hasTls} onChange={toggleTls} />
        {hasTls && (
          <>
            <Toggle label="無効な証明書を許可 (自己署名など)" checked={cfg.tls!.allow_invalid_certs} onChange={v => setTls({ allow_invalid_certs: v })} />
            <label style={labelStyle}>CA 証明書ファイル (PEM)</label>
            <input style={inputStyle} value={cfg.tls!.ca_file ?? ""} onChange={e => setTls({ ca_file: e.target.value || null })} placeholder="/path/to/ca.pem" />
            <label style={labelStyle}>クライアント証明書 + 秘密鍵ファイル (PEM)</label>
            <input style={inputStyle} value={cfg.tls!.cert_key_file ?? ""} onChange={e => setTls({ cert_key_file: e.target.value || null })} placeholder="/path/to/client.pem" />
          </>
        )}
      </Section>

      <Section title="SSH プロキシ">
        <Toggle label="SSH トンネルを使用" checked={hasSsh} onChange={toggleSsh} />
        {hasSsh && (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 3 }}>
                <label style={labelStyle}>SSH ホスト</label>
                <input style={{ width: "100%" }} value={cfg.ssh!.host} onChange={e => setSsh({ host: e.target.value })} placeholder="bastion.example.com" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>SSH ポート</label>
                <input style={{ width: "100%" }} type="number" value={cfg.ssh!.port} onChange={e => setSsh({ port: parseInt(e.target.value) || 22 })} />
              </div>
            </div>
            <label style={labelStyle}>SSH ユーザー名</label>
            <input style={inputStyle} value={cfg.ssh!.username} onChange={e => setSsh({ username: e.target.value })} />
            <label style={labelStyle}>秘密鍵ファイル (空の場合は SSH エージェントを使用)</label>
            <input style={inputStyle} value={cfg.ssh!.key_file ?? ""} onChange={e => setSsh({ key_file: e.target.value || null })} placeholder="~/.ssh/id_rsa" />
            <label style={labelStyle}>SSH パスワード (鍵認証優先、未入力なら SSH エージェント)</label>
            <input style={inputStyle} type="password" value={cfg.ssh!.password ?? ""} onChange={e => setSsh({ password: e.target.value || null })} />
          </>
        )}
      </Section>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
        <button onClick={onCancel}>キャンセル</button>
        <button className="primary" onClick={() => onSave(cfg)}>保存</button>
      </div>
    </div>
  );
}

export default function ConnectionManager({ connections, activeConnectionId, onRefresh, onConnect, onDisconnect }: Props) {
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleSave = async (cfg: Omit<ConnectionConfig, "id"> & { id?: string }) => {
    try {
      if (cfg.id) {
        await invoke("update_connection", { config: cfg });
      } else {
        await invoke("add_connection", { config: cfg });
      }
      setEditTarget(null);
      setError(null);
      onRefresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async (id: string) => {
    if (!await confirm("この接続設定を削除しますか？")) return;
    await invoke("remove_connection", { id });
    onRefresh();
  };

  const handleConnect = async (id: string) => {
    setLoading(id);
    setError(null);
    try {
      await invoke("connect", { id });
      onConnect(id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  };

  const handleDisconnect = async () => {
    await invoke("disconnect");
    onDisconnect();
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "var(--accent)", flex: 1 }}>接続管理</h3>
        {editTarget === null && (
          <button className="primary" onClick={() => setEditTarget("new")}>+ 新規接続</button>
        )}
      </div>

      {error && (
        <div style={{ background: "var(--red)", color: "var(--bg3)", padding: "6px 10px", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: "right", background: "none", color: "var(--bg3)", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {editTarget === "new" && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--accent)", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: 12 }}>新規接続</div>
          <ConnectionForm
            initial={defaultConnection()}
            onSave={handleSave}
            onCancel={() => setEditTarget(null)}
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {connections.map(c => {
          const isActive = c.id === activeConnectionId;
          const isEditing = editTarget === c.id;

          return (
            <div
              key={c.id}
              style={{
                background: isActive ? "var(--surface)" : "var(--bg2)",
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 8,
                padding: 12,
              }}
            >
              {isEditing ? (
                <>
                  <div style={{ color: "var(--accent2)", fontWeight: 600, marginBottom: 12 }}>編集: {c.name}</div>
                  <ConnectionForm
                    initial={c}
                    onSave={handleSave}
                    onCancel={() => setEditTarget(null)}
                  />
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {isActive && <span style={{ color: "var(--green)", fontSize: 10 }}>●</span>}
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      {c.host}:{c.port}
                      {c.auth && ` (${c.auth.username})`}
                      {c.tls && " 🔒"}
                      {c.ssh && " 🔑"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isActive ? (
                      <button className="danger" onClick={handleDisconnect}>切断</button>
                    ) : (
                      <button className="primary" onClick={() => handleConnect(c.id)} disabled={loading === c.id}>
                        {loading === c.id ? "接続中..." : "接続"}
                      </button>
                    )}
                    <button onClick={() => setEditTarget(c.id)}>編集</button>
                    <button onClick={() => handleRemove(c.id)}>削除</button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {connections.length === 0 && editTarget !== "new" && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "32px 0" }}>
            接続先を追加してください
          </div>
        )}
      </div>
    </div>
  );
}
