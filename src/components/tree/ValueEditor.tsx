import { useEffect, useRef, useState } from "react";
import type { BsonTypeTag } from "../../lib/bsonTypes";

interface Props {
  type: BsonTypeTag;
  initialRaw: unknown;
  onCommit: (raw: unknown) => void;
  onSaveNow: () => void;
  onCancel: () => void;
}

export default function ValueEditor({ type, initialRaw, onCommit, onSaveNow, onCancel }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<unknown>(initialRaw);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => onCommit(raw);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      if (e.ctrlKey || e.metaKey) onSaveNow();
    }
  };

  const commonStyle: React.CSSProperties = { fontSize: 13, padding: "4px 8px", width: 200 };

  if (type === "bool") {
    return (
      <input
        ref={ref}
        type="checkbox"
        checked={Boolean(raw)}
        onChange={(e) => {
          setRaw(e.target.checked);
          onCommit(e.target.checked);
        }}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (type === "date") {
    const millis = typeof raw === "number" ? raw : Date.now();
    const local = new Date(millis - new Date(millis).getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    return (
      <input
        ref={ref}
        type="datetime-local"
        defaultValue={local}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        style={commonStyle}
      />
    );
  }

  const isNumber = type === "int32" || type === "int64" || type === "double";
  return (
    <input
      ref={ref}
      type={isNumber ? "number" : "text"}
      step={type === "double" ? "any" : "1"}
      defaultValue={String(raw ?? "")}
      onChange={(e) => setRaw(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      style={commonStyle}
    />
  );
}
