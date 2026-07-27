import { useEffect } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
      <div style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
        zIndex: 200,
        minWidth: 160,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
            disabled={item.disabled}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 16px",
              background: "none",
              color: item.disabled ? "var(--text-muted)" : item.danger ? "var(--red)" : "var(--text)",
              border: "none",
              cursor: item.disabled ? "default" : "pointer",
              fontSize: 12,
              borderRadius: 0,
            }}
          >{item.label}</button>
        ))}
      </div>
    </>
  );
}
