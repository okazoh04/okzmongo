// input / textarea 用のコンテンツアシスト（候補ドロップダウン）を提供する共通フック。
// 候補の判定・生成は assist.ts、ここでは補完元データの取得・キー操作・表示を受け持つ。
import { ChangeEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import getCaretCoordinates from "textarea-caret";
import {
  applyCandidate, AssistMode, buildCandidates, Candidate, getAssistContext,
} from "./assist";

type Field = HTMLInputElement | HTMLTextAreaElement;

interface Options {
  mode: AssistMode;
  connectionId?: string;
  db?: string;
  /** expr モードで補完するフィールド名の取得元コレクション（query モードは db.<col>. から読む） */
  collection?: string | null;
  setValue: (v: string) => void;
}

// フィールド名はサンプリング取得で重いので、コンポーネントをまたいで短時間キャッシュする
const FIELD_CACHE_TTL_MS = 30_000;
const fieldCache = new Map<string, { at: number; names: string[] }>();

async function fetchFieldNames(connectionId: string, db: string, col: string): Promise<string[]> {
  const key = `${connectionId}/${db}/${col}`;
  const hit = fieldCache.get(key);
  if (hit && Date.now() - hit.at < FIELD_CACHE_TTL_MS) return hit.names;
  try {
    const names = await invoke<string[]>("get_field_names", {
      connectionId, dbName: db, collectionName: col,
    });
    fieldCache.set(key, { at: Date.now(), names });
    return names;
  } catch {
    return [];
  }
}

const DROPDOWN_MAX_HEIGHT = 200;

export function useContentAssist({ mode, connectionId, db, collection, setValue }: Options) {
  const ref = useRef<Field | null>(null);
  const [collections, setCollections] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // 非同期のフィールド取得中に入力が進んだ場合、古い結果を捨てるための連番
  const seq = useRef(0);

  useEffect(() => {
    if (mode !== "query" || !connectionId || !db) return;
    invoke<string[]>("list_collections", { connectionId, dbName: db })
      .then(setCollections)
      .catch(() => {});
  }, [mode, connectionId, db]);

  const close = useCallback(() => {
    seq.current++;
    setCandidates([]);
    setPos(null);
  }, []);

  const update = useCallback(async (text: string, caret: number, force = false) => {
    const my = ++seq.current;
    const ctx = getAssistContext(text, caret, mode, force);
    let fields: string[] = [];
    if (ctx.kind === "field") {
      const col = mode === "query" ? ctx.collection : collection;
      if (col && connectionId && db) fields = await fetchFieldNames(connectionId, db, col);
      if (my !== seq.current) return;
    }
    const list = buildCandidates(ctx, { collections, fields }, text[caret] ?? "");
    const el = ref.current;
    if (!el || list.length === 0) {
      setCandidates([]);
      setPos(null);
      return;
    }
    const coords = getCaretCoordinates(el, caret);
    const rect = el.getBoundingClientRect();
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 18;
    let top = rect.top + coords.top - el.scrollTop + lineHeight;
    // 下にはみ出す場合はカーソルの上に出す
    if (top + DROPDOWN_MAX_HEIGHT > window.innerHeight) {
      top = Math.max(0, rect.top + coords.top - el.scrollTop - DROPDOWN_MAX_HEIGHT);
    }
    setPos({ top, left: rect.left + coords.left - el.scrollLeft });
    setCandidates(list);
    setIdx(0);
  }, [mode, collection, connectionId, db, collections]);

  const apply = (cand: Candidate) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const ctx = getAssistContext(el.value, caret, mode, true);
    const r = applyCandidate(el.value, caret, ctx.token, cand);
    setValue(r.text);
    close();
    setTimeout(() => { el.setSelectionRange(r.caret, r.caret); el.focus(); }, 0);
  };

  /** onChange から呼ぶ。値の反映と候補更新をまとめて行う */
  const onInput = (e: ChangeEvent<Field>) => {
    setValue(e.target.value);
    update(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  /** onKeyDown の先頭で呼ぶ。補完が処理したキーなら true（呼び出し側は何もしない） */
  const onKeyDown = (e: KeyboardEvent<Field>): boolean => {
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      const el = e.currentTarget;
      update(el.value, el.selectionStart ?? el.value.length, true);
      return true;
    }
    if (candidates.length === 0) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, candidates.length - 1)); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); return true; }
    if ((e.key === "Tab" || e.key === "Enter") && !e.ctrlKey && !e.metaKey && candidates[idx]) {
      e.preventDefault();
      apply(candidates[idx]);
      return true;
    }
    if (e.key === "Escape") { e.stopPropagation(); close(); return true; }
    return false;
  };

  const dropdown: ReactNode = candidates.length > 0 && pos && (
    <div style={{
      position: "fixed", top: pos.top, left: pos.left, zIndex: 10000,
      background: "var(--bg2)", border: "1px solid var(--border)",
      borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      minWidth: 200, maxHeight: DROPDOWN_MAX_HEIGHT, overflow: "auto",
    }}>
      {candidates.map((c, i) => (
        <div
          key={c.label}
          onMouseDown={e => { e.preventDefault(); apply(c); }}
          style={{
            padding: "4px 10px", fontSize: 12, fontFamily: "monospace", cursor: "pointer",
            display: "flex", gap: 12, justifyContent: "space-between",
            background: i === idx ? "var(--accent)" : "transparent",
            color: i === idx ? "white" : "var(--text)",
          }}
        >
          <span>{c.label}</span>
          {c.detail && <span style={{ opacity: 0.6 }}>{c.detail}</span>}
        </div>
      ))}
    </div>
  );

  return { ref, onInput, onKeyDown, onBlur: close, update, dropdown };
}
