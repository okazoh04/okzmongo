import { useState } from "react";
import { ConnectionConfig, AuthConfig, TlsConfig, SshConfig } from "../types";

const inputStyle: React.CSSProperties = { width: "100%", marginBottom: 4 };
const labelStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: 10, display: "block", marginBottom: 1 };

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, marginBottom: 5 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "var(--accent)", fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function ConnectionForm({
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

  const setAuth = (patch: Partial<AuthConfig>) => set({ auth: { ...cfg.auth!, ...patch } });
  const setTls  = (patch: Partial<TlsConfig>)  => set({ tls:  { ...cfg.tls!,  ...patch } });
  const setSsh  = (patch: Partial<SshConfig>)  => set({ ssh:  { ...cfg.ssh!,  ...patch } });

  return (
    <div>
      <Section title="基本">
        <label style={labelStyle}>接続名</label>
        <input style={inputStyle} value={cfg.name} onChange={e => set({ name: e.target.value })} placeholder="My MongoDB" />
        <div style={{ display: "flex", gap: 4 }}>
          <div style={{ flex: 3 }}>
            <label style={labelStyle}>ホスト</label>
            <input style={{ width: "100%" }} value={cfg.host} onChange={e => set({ host: e.target.value })} placeholder="localhost" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>ポート</label>
            <input style={{ width: "100%" }} type="number" value={cfg.port}
              onChange={e => set({ port: parseInt(e.target.value) || 27017 })} />
          </div>
        </div>
      </Section>

      <Section title="認証">
        <Toggle label="認証を使用" checked={cfg.auth !== null}
          onChange={on => set({ auth: on ? { username: "", password: "", auth_db: "admin" } : null })} />
        {cfg.auth && (
          <>
            <label style={labelStyle}>ユーザー名</label>
            <input style={inputStyle} value={cfg.auth.username} onChange={e => setAuth({ username: e.target.value })} />
            <label style={labelStyle}>パスワード</label>
            <input style={inputStyle} type="password" value={cfg.auth.password} onChange={e => setAuth({ password: e.target.value })} />
            <label style={labelStyle}>認証DB</label>
            <input style={inputStyle} value={cfg.auth.auth_db} onChange={e => setAuth({ auth_db: e.target.value })} placeholder="admin" />
          </>
        )}
      </Section>

      <Section title="SSL / TLS">
        <Toggle label="TLS を有効化" checked={cfg.tls !== null}
          onChange={on => set({ tls: on ? { enabled: true, ca_file: null, cert_key_file: null, allow_invalid_certs: false } : null })} />
        {cfg.tls && (
          <>
            <Toggle label="無効な証明書を許可" checked={cfg.tls.allow_invalid_certs}
              onChange={v => setTls({ allow_invalid_certs: v })} />
            <label style={labelStyle}>CA 証明書 (PEM)</label>
            <input style={inputStyle} value={cfg.tls.ca_file ?? ""} onChange={e => setTls({ ca_file: e.target.value || null })} placeholder="/path/to/ca.pem" />
            <label style={labelStyle}>クライアント証明書+秘密鍵 (PEM)</label>
            <input style={inputStyle} value={cfg.tls.cert_key_file ?? ""} onChange={e => setTls({ cert_key_file: e.target.value || null })} placeholder="/path/to/client.pem" />
          </>
        )}
      </Section>

      <Section title="SSH プロキシ">
        <Toggle label="SSH トンネルを使用" checked={cfg.ssh !== null}
          onChange={on => set({ ssh: on ? { enabled: true, host: "", port: 22, username: "", password: null, key_file: null } : null })} />
        {cfg.ssh && (
          <>
            <div style={{ display: "flex", gap: 4 }}>
              <div style={{ flex: 3 }}>
                <label style={labelStyle}>SSH ホスト</label>
                <input style={{ width: "100%" }} value={cfg.ssh.host} onChange={e => setSsh({ host: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>ポート</label>
                <input style={{ width: "100%" }} type="number" value={cfg.ssh.port} onChange={e => setSsh({ port: parseInt(e.target.value) || 22 })} />
              </div>
            </div>
            <label style={labelStyle}>SSH ユーザー名</label>
            <input style={inputStyle} value={cfg.ssh.username} onChange={e => setSsh({ username: e.target.value })} />
            <label style={labelStyle}>秘密鍵ファイル（空なら SSH エージェント）</label>
            <input style={inputStyle} value={cfg.ssh.key_file ?? ""} onChange={e => setSsh({ key_file: e.target.value || null })} placeholder="~/.ssh/id_rsa" />
            <label style={labelStyle}>SSH パスワード（鍵優先）</label>
            <input style={inputStyle} type="password" value={cfg.ssh.password ?? ""} onChange={e => setSsh({ password: e.target.value || null })} />
          </>
        )}
      </Section>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ fontSize: 11 }}>キャンセル</button>
        <button className="primary" onClick={() => onSave(cfg)} style={{ fontSize: 11 }}>保存</button>
      </div>
    </div>
  );
}
