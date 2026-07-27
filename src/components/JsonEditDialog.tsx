import { useState } from "react";
import { useI18n } from "../i18n";

interface Props {
  title: string;
  value: unknown;
  onSave: (parsed: unknown) => void;
  onClose: () => void;
}

export default function JsonEditDialog({ title, value, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [json, setJson] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleOk = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError(t.invalidJson);
      return;
    }
    onSave(parsed);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
      }}
    >
      <div
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: 560,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600,
            color: "var(--accent)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{title}</span>
          <button onClick={onClose} style={{ background: "none", fontSize: 16 }}>✕</button>
        </div>

        {error && (
          <div style={{ background: "var(--red)", color: "var(--bg3)", padding: "6px 16px", fontSize: 12 }}>
            {error}
          </div>
        )}

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleOk();
            }
          }}
          style={{
            flex: 1,
            resize: "none",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 12,
            padding: 16,
            background: "var(--bg3)",
            border: "none",
            color: "var(--text)",
            minHeight: 240,
          }}
          spellCheck={false}
        />

        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onClose}>{t.cancel}</button>
          <button className="primary" onClick={handleOk}>{t.ok}</button>
        </div>
      </div>
    </div>
  );
}
