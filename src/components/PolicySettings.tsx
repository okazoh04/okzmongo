import { useState } from "react";
import { useI18n } from "../i18n";
import { usePolicy } from "../PolicyProvider";
import {
  ENVIRONMENT_TIERS, OPERATION_KEYS, PERMISSION_LEVELS,
  ENV_LABEL_KEY, OP_LABEL_KEY, PERMISSION_LABEL_KEY, ENV_COLOR,
  PolicyMatrix, PermissionLevel, OperationKey,
} from "../policy";
import { EnvironmentTier } from "../types";

const LEVEL_COLOR: Record<PermissionLevel, string> = {
  allow: "var(--green)",
  warn: "var(--yellow)",
  block: "var(--red)",
};

export default function PolicySettings({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { policy, setPolicy } = usePolicy();
  const [draft, setDraft] = useState<PolicyMatrix>(policy);

  const setCell = (env: EnvironmentTier, op: OperationKey, level: PermissionLevel) => {
    setDraft(prev => ({ ...prev, [env]: { ...prev[env], [op]: level } }));
  };

  const handleSave = () => {
    setPolicy(draft);
    onClose();
  };

  const cellStyle: React.CSSProperties = { padding: "6px 8px", textAlign: "center" };
  const selectStyle: React.CSSProperties = { fontSize: 11, padding: "3px 22px 3px 8px" };
  const buttonStyle: React.CSSProperties = { fontSize: 12, padding: "5px 14px" };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        width: 640,
        maxWidth: "94vw",
        maxHeight: "88vh",
        overflow: "auto",
        padding: 20,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <span style={{ color: "var(--accent2)", fontWeight: 700, fontSize: 14, flex: 1 }}>
            {t.policySettingsTitle}
          </span>
          <button onClick={onClose} style={{ fontSize: 12, padding: "4px 9px" }}>✕</button>
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 12 }}>
          {t.policySettingsHint}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...cellStyle, textAlign: "left", color: "var(--text-muted)" }} />
              {ENVIRONMENT_TIERS.map(env => (
                <th key={env} style={{ ...cellStyle, color: ENV_COLOR[env], fontWeight: 700 }}>
                  {t[ENV_LABEL_KEY[env]]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OPERATION_KEYS.map(op => (
              <tr key={op} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ ...cellStyle, textAlign: "left", color: "var(--text)" }}>
                  {t[OP_LABEL_KEY[op]]}
                </td>
                {ENVIRONMENT_TIERS.map(env => (
                  <td key={env} style={cellStyle}>
                    <select
                      value={draft[env][op]}
                      onChange={e => setCell(env, op, e.target.value as PermissionLevel)}
                      style={{ ...selectStyle, color: LEVEL_COLOR[draft[env][op]], fontWeight: 600 }}
                    >
                      {PERMISSION_LEVELS.map(level => (
                        <option key={level} value={level}>{t[PERMISSION_LABEL_KEY[level]]}</option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={buttonStyle}>{t.cancel}</button>
          <button className="primary" onClick={handleSave} style={buttonStyle}>{t.save}</button>
        </div>
      </div>
    </div>
  );
}
