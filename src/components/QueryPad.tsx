import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import getCaretCoordinates from "textarea-caret";

interface Props {
  connectionId: string;
  db: string;
  initialQuery?: string;
}

const PAGE_SIZE = 50;

const METHODS = [
  "find", "findOne", "aggregate", "countDocuments",
  "insertOne", "updateOne", "deleteOne",
  "drop", "createIndex", "dropIndex", "estimatedDocumentCount",
];

const MONGO_OPERATORS = [
  "$match", "$group", "$sort", "$project", "$limit", "$skip", "$unwind",
  "$lookup", "$count", "$addFields", "$replaceRoot", "$set", "$unset",
  "$facet", "$out", "$merge",
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin",
  "$and", "$or", "$not", "$nor", "$exists", "$type", "$regex",
  "$sum", "$avg", "$min", "$max", "$first", "$last", "$push", "$addToSet",
  "$multiply", "$divide", "$add", "$subtract", "$mod", "$abs",
  "$concat", "$toLower", "$toUpper", "$trim", "$substr",
  "$ifNull", "$cond", "$switch", "$arrayElemAt", "$size", "$slice",
  "$dateToString", "$year", "$month", "$dayOfMonth",
];

// ネストを考慮してトップレベルのカンマで引数を分割
function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inStr = false;
  let strCh = "";
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === strCh && s[i - 1] !== "\\") inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true; strCh = ch; cur += ch;
    } else if ("{[(".includes(ch)) {
      depth++; cur += ch;
    } else if ("}])".includes(ch)) {
      depth--; cur += ch;
    } else if (ch === "," && depth === 0) {
      args.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

interface Parsed {
  collection: string;
  method: string;
  args: string[];
}

function parseMongosh(input: string): Parsed | string {
  const s = input.trim().replace(/;?\s*$/, "");
  const m = s.match(/^db\.(\w+)\.(\w+)\(([\s\S]*)\)$/);
  if (!m) return 'db.コレクション名.メソッド(引数) の形式で入力してください';
  return { collection: m[1], method: m[2], args: splitArgs(m[3].trim()) };
}

// カーソル直前のトークンを取得
function getToken(text: string, pos: number) {
  const m = text.slice(0, pos).match(/[\w$.]+$/);
  return m ? m[0] : "";
}

// カーソル位置のコンテキスト判定
function getContext(text: string, pos: number): {
  kind: "collection" | "method" | "operator" | "field" | "none";
  token: string;
  collection?: string;
} {
  const before = text.slice(0, pos);

  // db.XXX の途中（コレクション名補完）: db. の後、次の . が来る前
  const colMatch = before.match(/\bdb\.(\w*)$/);
  if (colMatch) {
    return { kind: "collection", token: colMatch[1] };
  }
  // db.col.XXX の途中（メソッド名補完）
  const methMatch = before.match(/\bdb\.(\w+)\.(\w*)$/);
  if (methMatch) {
    return { kind: "method", token: methMatch[2], collection: methMatch[1] };
  }

  const token = getToken(text, pos);
  if (token.startsWith("$")) return { kind: "operator", token };
  if (token.length > 1) {
    const col = text.match(/\bdb\.(\w+)\./)?.[1];
    return { kind: "field", token, collection: col };
  }
  return { kind: "none", token: "" };
}

type ResultView =
  | { kind: "docs"; docs: Record<string, unknown>[]; total: number; page: number; isAggregate: boolean }
  | { kind: "scalar"; label: string; value: unknown }
  | { kind: "message"; ok: boolean; text: string };

export default function QueryPad({ connectionId, db, initialQuery }: Props) {
  const { t, tpl } = useI18n();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [result, setResult] = useState<ResultView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 補完用データ
  const [collections, setCollections] = useState<string[]>([]);
  const [fieldCache, setFieldCache] = useState<Record<string, string[]>>({});

  // 補完ドロップダウン
  const [candidates, setCandidates] = useState<string[]>([]);
  const [candIdx, setCandIdx] = useState(0);
  const [candPos, setCandPos] = useState<{ top: number; left: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // initialQuery が変わったら反映
  useEffect(() => {
    if (initialQuery !== undefined) setQuery(initialQuery);
  }, [initialQuery]);

  // コレクション一覧を取得（補完用）
  useEffect(() => {
    invoke<string[]>("list_collections", { connectionId, dbName: db })
      .then(setCollections)
      .catch(() => {});
  }, [connectionId, db]);

  // フィールド名をキャッシュ付きで取得
  const getFieldNames = useCallback(async (col: string) => {
    if (fieldCache[col]) return fieldCache[col];
    try {
      const names = await invoke<string[]>("get_field_names", {
        connectionId, dbName: db, collectionName: col,
      });
      setFieldCache(c => ({ ...c, [col]: names }));
      return names;
    } catch {
      return [];
    }
  }, [connectionId, db, fieldCache]);

  const runQuery = useCallback(async (targetPage = 0) => {
    const q = query.trim();
    if (!q) return;

    const parsed = parseMongosh(q);
    if (typeof parsed === "string") { setError(parsed); return; }

    const { collection: col, method, args } = parsed;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      switch (method) {
        case "find": {
          const filterJson = args[0] ?? "{}";
          const skip = targetPage * PAGE_SIZE;
          const [docs, total] = await Promise.all([
            invoke<Record<string, unknown>[]>("find_documents", {
              connectionId, dbName: db, collectionName: col,
              filterJson, skip, limit: PAGE_SIZE,
            }),
            invoke<number>("count_documents", {
              connectionId, dbName: db, collectionName: col, filterJson,
            }),
          ]);
          setResult({ kind: "docs", docs, total, page: targetPage, isAggregate: false });
          break;
        }
        case "findOne": {
          const filterJson = args[0] ?? "{}";
          const docs = await invoke<Record<string, unknown>[]>("find_documents", {
            connectionId, dbName: db, collectionName: col,
            filterJson, skip: 0, limit: 1,
          });
          setResult({ kind: "docs", docs, total: docs.length, page: 0, isAggregate: false });
          break;
        }
        case "aggregate": {
          const pipelineJson = args[0] ?? "[]";
          const docs = await invoke<Record<string, unknown>[]>("run_aggregate", {
            connectionId, dbName: db, collectionName: col, pipelineJson,
          });
          setResult({ kind: "docs", docs, total: docs.length, page: 0, isAggregate: true });
          break;
        }
        case "countDocuments":
        case "estimatedDocumentCount": {
          const filterJson = method === "estimatedDocumentCount" ? "{}" : (args[0] ?? "{}");
          const cnt = await invoke<number>("count_documents", {
            connectionId, dbName: db, collectionName: col, filterJson,
          });
          setResult({ kind: "scalar", label: method, value: cnt });
          break;
        }
        case "insertOne": {
          const docJson = args[0] ?? "{}";
          const id = await invoke<string>("insert_document", {
            connectionId, dbName: db, collectionName: col, docJson,
          });
          setResult({ kind: "message", ok: true, text: `挿入完了: _id = ${id}` });
          break;
        }
        case "updateOne": {
          const filterJson = args[0] ?? "{}";
          const updateJson = args[1] ?? "{}";
          const cnt = await invoke<number>("update_one_by_filter", {
            connectionId, dbName: db, collectionName: col, filterJson, updateJson,
          });
          setResult({ kind: "message", ok: true, text: `更新完了: ${cnt} 件変更` });
          break;
        }
        case "deleteOne": {
          const filterJson = args[0] ?? "{}";
          const cnt = await invoke<number>("delete_one_by_filter", {
            connectionId, dbName: db, collectionName: col, filterJson,
          });
          setResult({ kind: "message", ok: cnt > 0, text: `削除完了: ${cnt} 件削除` });
          break;
        }
        default:
          setError(`"${method}" は未対応です（対応: ${METHODS.slice(0, 7).join(", ")}）`);
      }
    } catch (e) {
      setError(tpl(t.queryError, { error: String(e) }));
    } finally {
      setLoading(false);
    }
  }, [connectionId, db, query, t, tpl]);

  // 補完候補を更新
  const updateCandidates = useCallback(async (text: string, pos: number) => {
    const ctx = getContext(text, pos);
    let matches: string[] = [];
    switch (ctx.kind) {
      case "collection":
        matches = collections.filter(c => c.startsWith(ctx.token) && c !== ctx.token);
        break;
      case "method":
        matches = METHODS.filter(m => m.startsWith(ctx.token) && m !== ctx.token);
        break;
      case "operator":
        matches = MONGO_OPERATORS.filter(o => o.startsWith(ctx.token) && o !== ctx.token);
        break;
      case "field":
        if (ctx.collection) {
          const fields = await getFieldNames(ctx.collection);
          matches = fields.filter(f => f.startsWith(ctx.token) && f !== ctx.token);
        }
        break;
    }
    const ta = taRef.current;
    if (ta && matches.length > 0) {
      const coords = getCaretCoordinates(ta, pos);
      const rect = ta.getBoundingClientRect();
      const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 18;
      setCandPos({
        top: rect.top + coords.top - ta.scrollTop + lineHeight,
        left: rect.left + coords.left,
      });
    } else {
      setCandPos(null);
    }
    setCandidates(matches.slice(0, 8));
    setCandIdx(0);
  }, [collections, getFieldNames]);

  const applyCandidate = (cand: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    // getContext が返すトークン（db. や db.col. のプレフィックスを含まない部分）を使う
    const ctx = getContext(query, pos);
    const token = ctx.token;
    const newQuery = query.slice(0, pos - token.length) + cand + query.slice(pos);
    setQuery(newQuery);
    setCandidates([]);
    const newPos = pos - token.length + cand.length;
    setTimeout(() => { ta.setSelectionRange(newPos, newPos); ta.focus(); }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    updateCandidates(e.target.value, e.target.selectionStart ?? 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (candidates.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCandIdx(i => Math.min(i + 1, candidates.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setCandIdx(i => Math.max(i - 1, 0)); return; }
      if ((e.key === "Tab" || e.key === "Enter") && candidates[candIdx]) { e.preventDefault(); applyCandidate(candidates[candIdx]); return; }
      if (e.key === "Escape") { setCandidates([]); return; }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(0); }
  };

  const totalPages = result?.kind === "docs" && !result.isAggregate
    ? Math.ceil(result.total / PAGE_SIZE) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* 入力エリア */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--border)",
        background: "var(--bg2)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ fontSize: 11, color: "var(--yellow)" }}>{db}</div>

        <div>
          <textarea
            ref={taRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={e => updateCandidates(query, (e.target as HTMLTextAreaElement).selectionStart)}
            placeholder={`db.collection.find({"field": "value"})\ndb.collection.aggregate([{"$match": {...}}])\ndb.collection.countDocuments({})\ndb.collection.insertOne({...})\ndb.collection.updateOne({filter}, {update})\ndb.collection.deleteOne({filter})`}
            rows={5}
            style={{
              width: "100%", fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12, resize: "vertical", background: "var(--bg)",
              color: "var(--text)", border: "1px solid var(--border)",
              borderRadius: 4, padding: "6px 8px", boxSizing: "border-box",
            }}
          />
          {candidates.length > 0 && candPos && (
            <div style={{
              position: "fixed",
              top: candPos.top,
              left: candPos.left,
              zIndex: 1000,
              background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              minWidth: 200, maxHeight: 200, overflow: "auto",
            }}>
              {candidates.map((c, i) => (
                <div
                  key={c}
                  onMouseDown={e => { e.preventDefault(); applyCandidate(c); }}
                  style={{
                    padding: "4px 10px", fontSize: 12, fontFamily: "monospace",
                    cursor: "pointer",
                    background: i === candIdx ? "var(--accent)" : "transparent",
                    color: i === candIdx ? "white" : "var(--text)",
                  }}
                >{c}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="primary" onClick={() => runQuery(0)} disabled={loading} style={{ fontSize: 12 }}>
            {loading ? "…" : t.runQuery}
          </button>
          <button onClick={() => { setQuery(""); setResult(null); setError(null); setCandidates([]); }} style={{ fontSize: 12 }}>
            {t.clear}
          </button>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Ctrl+Enter {t.runQuery}</span>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div style={{ background: "var(--red)", color: "var(--bg3)", padding: "5px 12px", fontSize: 12, flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* 結果 */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {result?.kind === "scalar" && (
          <div style={{ padding: "16px 12px", fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)", marginRight: 8 }}>{result.label}:</span>
            <span style={{ color: "var(--accent2)", fontFamily: "monospace", fontWeight: 700 }}>
              {String(result.value)}
            </span>
          </div>
        )}

        {result?.kind === "message" && (
          <div style={{
            padding: "8px 12px", fontSize: 12, flexShrink: 0,
            background: result.ok ? "var(--green)" : "var(--red)", color: "var(--bg3)",
          }}>
            {result.text}
          </div>
        )}

        {result?.kind === "docs" && (
          <>
            <div style={{
              padding: "5px 12px", borderBottom: "1px solid var(--border)",
              background: "var(--bg2)", fontSize: 12, color: "var(--text-sub)", flexShrink: 0,
            }}>
              {tpl(t.queryResultCount, { count: result.total.toLocaleString() })}
              {result.isAggregate && <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>aggregate</span>}
            </div>
            {result.docs.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>{t.queryNoResult}</div>
            )}
            {result.docs.map((doc, i) => (
              <div key={i} style={{ borderBottom: "1px solid var(--border)", padding: "8px 12px" }}>
                <pre style={{
                  margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                  fontSize: 11, color: "var(--text)",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}>{JSON.stringify(doc, null, 2)}</pre>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ページネーション（find のみ） */}
      {result?.kind === "docs" && !result.isAggregate && totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
          borderTop: "1px solid var(--border)", background: "var(--bg2)", flexShrink: 0,
        }}>
          <button onClick={() => runQuery(0)} disabled={result.page === 0}>|◀</button>
          <button onClick={() => runQuery(result.page - 1)} disabled={result.page === 0}>◀</button>
          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>{result.page + 1} / {totalPages}</span>
          <button onClick={() => runQuery(result.page + 1)} disabled={result.page >= totalPages - 1}>▶</button>
          <button onClick={() => runQuery(totalPages - 1)} disabled={result.page >= totalPages - 1}>▶|</button>
        </div>
      )}
    </div>
  );
}
