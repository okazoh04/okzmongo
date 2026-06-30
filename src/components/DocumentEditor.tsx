import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  connectionId: string;
  db: string;
  collection: string;
  initialDoc: Record<string, unknown>;
  isNew?: boolean;
  onSaved: () => void;
  onClose: () => void;
}

export default function DocumentEditor({
  connectionId,
  db,
  collection,
  initialDoc,
  isNew = false,
  onSaved,
  onClose,
}: Props) {
  const [json, setJson] = useState(JSON.stringify(initialDoc, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("JSONの構文が正しくありません");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await invoke("insert_document", {
          connectionId,
          dbName: db,
          collectionName: collection,
          docJson: JSON.stringify(parsed),
        });
      } else {
        const id = initialDoc._id as string;
        await invoke("update_document", {
          connectionId,
          dbName: db,
          collectionName: collection,
          id,
          docJson: JSON.stringify(parsed),
        });
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        width: 600,
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          fontWeight: 600,
          color: "var(--accent)",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>{isNew ? "ドキュメント追加" : "ドキュメント編集"}</span>
          <button onClick={onClose} style={{ background: "none", fontSize: 16 }}>✕</button>
        </div>

        {error && (
          <div style={{
            background: "var(--red)",
            color: "var(--bg3)",
            padding: "6px 16px",
            fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          style={{
            flex: 1,
            resize: "none",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 12,
            padding: 16,
            background: "var(--bg3)",
            border: "none",
            color: "var(--text)",
            minHeight: 300,
          }}
          spellCheck={false}
        />

        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
        }}>
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
