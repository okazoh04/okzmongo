import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useI18n } from "../i18n";
import icon from "../assets/icon.png";

interface Props {
  onClose: () => void;
}

export default function About({ onClose }: Props) {
  const { t } = useI18n();
  const [version, setVersion] = useState<string>("...");

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "32px 40px",
          minWidth: 320,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <img src={icon} alt="OkzMongo" style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 4 }}/>
        <div style={{ fontWeight: 700, fontSize: 20, color: "var(--accent2)" }}>OkzMongo</div>
        <div style={{ fontSize: 13, color: "var(--text-sub)" }}>
          {t.appDescription}
        </div>
        <div style={{
          fontSize: 12,
          color: "var(--text-muted)",
          background: "var(--bg3)",
          borderRadius: 4,
          padding: "4px 16px",
        }}>
          {t.version} {version}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Tauri v2 + React 19 + MongoDB v3
        </div>
        <button
          onClick={onClose}
          style={{ marginTop: 12, padding: "7px 24px" }}
        >
          {t.close}
        </button>
      </div>
    </div>
  );
}
