import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionConfig, AuthConfig, TlsConfig, SshConfig } from "../types";
import { useI18n } from "../i18n";

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

function FilePicker({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const browse = async () => {
    const path = await open({ multiple: false });
    if (typeof path === "string") onChange(path);
  };
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
      <input
        style={{ flex: 1 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button type="button" onClick={browse} style={{ flexShrink: 0 }}>
        {t.browseFile}
      </button>
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
  const { t, tpl } = useI18n();
  const [cfg, setCfg] = useState(initial);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testError, setTestError] = useState("");

  const set = (patch: Partial<typeof cfg>) => setCfg(c => ({ ...c, ...patch }));
  const setAuth = (patch: Partial<AuthConfig>) => set({ auth: { ...cfg.auth!, ...patch } });
  const setTls  = (patch: Partial<TlsConfig>)  => set({ tls:  { ...cfg.tls!,  ...patch } });
  const setSsh  = (patch: Partial<SshConfig>)  => set({ ssh:  { ...cfg.ssh!,  ...patch } });

  const handleTest = async () => {
    setTestState("testing");
    setTestError("");
    try {
      await invoke("test_connection", { config: cfg });
      setTestState("ok");
    } catch (e) {
      setTestState("error");
      setTestError(String(e));
    }
  };

  const testColor = testState === "ok" ? "var(--green)" : testState === "error" ? "var(--red)" : "var(--text-muted)";
  const testMsg = testState === "ok"
    ? t.testConnectionOk
    : testState === "error"
    ? tpl(t.testConnectionFail, { error: testError })
    : "";

  return (
    <div>
      <Section title={t.sectionBasic}>
        <label style={labelStyle}>{t.labelName}</label>
        <input style={inputStyle} value={cfg.name} onChange={e => set({ name: e.target.value })} placeholder="My MongoDB" />
        <div style={{ display: "flex", gap: 4 }}>
          <div style={{ flex: 3 }}>
            <label style={labelStyle}>{t.labelHost}</label>
            <input style={{ width: "100%" }} value={cfg.host} onChange={e => set({ host: e.target.value })} placeholder="localhost" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t.labelPort}</label>
            <input style={{ width: "100%" }} type="number" value={cfg.port}
              onChange={e => set({ port: parseInt(e.target.value) || 27017 })} />
          </div>
        </div>
      </Section>

      <Section title={t.sectionAuth}>
        <Toggle label={t.toggleAuth} checked={cfg.auth !== null}
          onChange={on => set({ auth: on ? { username: "", password: "", auth_db: "admin" } : null })} />
        {cfg.auth && (
          <>
            <label style={labelStyle}>{t.labelUsername}</label>
            <input style={inputStyle} value={cfg.auth.username} onChange={e => setAuth({ username: e.target.value })} />
            <label style={labelStyle}>{t.labelPassword}</label>
            <input style={inputStyle} type="password" value={cfg.auth.password} onChange={e => setAuth({ password: e.target.value })} />
            <label style={labelStyle}>{t.labelAuthDb}</label>
            <input style={inputStyle} value={cfg.auth.auth_db} onChange={e => setAuth({ auth_db: e.target.value })} placeholder="admin" />
          </>
        )}
      </Section>

      <Section title={t.sectionTls}>
        <Toggle label={t.toggleTls} checked={cfg.tls !== null}
          onChange={on => set({ tls: on ? { enabled: true, ca_file: null, cert_key_file: null, allow_invalid_certs: false } : null })} />
        {cfg.tls && (
          <>
            <Toggle label={t.toggleAllowInvalidCerts} checked={cfg.tls.allow_invalid_certs}
              onChange={v => setTls({ allow_invalid_certs: v })} />
            <label style={labelStyle}>{t.labelCaFile}</label>
            <FilePicker
              value={cfg.tls.ca_file ?? ""}
              onChange={v => setTls({ ca_file: v || null })}
              placeholder="/path/to/ca.pem"
            />
            <label style={labelStyle}>{t.labelCertKeyFile}</label>
            <FilePicker
              value={cfg.tls.cert_key_file ?? ""}
              onChange={v => setTls({ cert_key_file: v || null })}
              placeholder="/path/to/client.pem"
            />
          </>
        )}
      </Section>

      <Section title={t.sectionSsh}>
        <Toggle label={t.toggleSsh} checked={cfg.ssh !== null}
          onChange={on => set({ ssh: on ? { enabled: true, host: "", port: 22, username: "", password: null, key_file: null } : null })} />
        {cfg.ssh && (
          <>
            <div style={{ display: "flex", gap: 4 }}>
              <div style={{ flex: 3 }}>
                <label style={labelStyle}>{t.labelSshHost}</label>
                <input style={{ width: "100%" }} value={cfg.ssh.host} onChange={e => setSsh({ host: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{t.labelPort}</label>
                <input style={{ width: "100%" }} type="number" value={cfg.ssh.port} onChange={e => setSsh({ port: parseInt(e.target.value) || 22 })} />
              </div>
            </div>
            <label style={labelStyle}>{t.labelSshUsername}</label>
            <input style={inputStyle} value={cfg.ssh.username} onChange={e => setSsh({ username: e.target.value })} />
            <label style={labelStyle}>{t.labelKeyFile}</label>
            <FilePicker
              value={cfg.ssh.key_file ?? ""}
              onChange={v => setSsh({ key_file: v || null })}
              placeholder="~/.ssh/id_rsa"
            />
            <label style={labelStyle}>{t.labelSshPassword}</label>
            <input style={inputStyle} type="password" value={cfg.ssh.password ?? ""} onChange={e => setSsh({ password: e.target.value || null })} />
          </>
        )}
      </Section>

      {/* 接続確認結果 */}
      {testMsg && (
        <div style={{ fontSize: 11, color: testColor, marginBottom: 6, wordBreak: "break-all" }}>
          {testMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={handleTest} disabled={testState === "testing"}>
          {testState === "testing" ? t.testConnectionTesting : t.testConnection}
        </button>
        <button onClick={onCancel}>{t.cancel}</button>
        <button className="primary" onClick={() => onSave(cfg)}>{t.save}</button>
      </div>
    </div>
  );
}
