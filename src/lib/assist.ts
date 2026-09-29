// コンテンツアシスト（入力補完）の純粋ロジック。UI には依存しない。
// クエリパッド（mongosh 風）・フィルタ欄・ドキュメント編集（JS 式）で共通に使う。

export type AssistMode = "query" | "expr";

export interface Candidate {
  /** ドロップダウンに表示する名前 */
  label: string;
  /** 実際に挿入する文字列 */
  insert: string;
  /** 挿入後のカーソル位置（insert 先頭からのオフセット）。省略時は末尾 */
  caret?: number;
  /** 補足表示（シグネチャなど。コードなので翻訳しない） */
  detail?: string;
}

export type AssistKind = "collection" | "method" | "operator" | "field" | "helper" | "none";

export interface AssistContext {
  kind: AssistKind;
  /** カーソル直前の入力中トークン（置換対象） */
  token: string;
  /** `db.<collection>.` から読み取ったコレクション名（query モード） */
  collection?: string;
}

// メソッドは引数の雛形付きで挿入する（カーソルは最初の引数の中）
const METHOD_DEFS: { name: string; args: string; caret: number }[] = [
  { name: "find", args: "({})", caret: 2 },
  { name: "findOne", args: "({})", caret: 2 },
  { name: "aggregate", args: "([{}])", caret: 3 },
  { name: "countDocuments", args: "({})", caret: 2 },
  { name: "estimatedDocumentCount", args: "()", caret: 1 },
  { name: "insertOne", args: "({})", caret: 2 },
  { name: "updateOne", args: "({}, {$set: {}})", caret: 2 },
  { name: "deleteOne", args: "({})", caret: 2 },
  { name: "drop", args: "()", caret: 1 },
  { name: "createIndex", args: "({})", caret: 2 },
  { name: "dropIndex", args: "()", caret: 1 },
];

export const OPERATORS: string[] = [
  // 比較・論理・要素
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin",
  "$and", "$or", "$not", "$nor", "$exists", "$type", "$regex", "$options",
  "$expr", "$elemMatch", "$all", "$size", "$mod", "$text", "$search",
  // 更新
  "$set", "$unset", "$inc", "$mul", "$rename", "$setOnInsert", "$currentDate",
  "$push", "$pull", "$pop", "$addToSet", "$each",
  // 集約ステージ
  "$match", "$group", "$sort", "$project", "$limit", "$skip", "$unwind",
  "$lookup", "$count", "$addFields", "$replaceRoot", "$replaceWith",
  "$facet", "$bucket", "$sample", "$out", "$merge",
  // 集約式
  "$sum", "$avg", "$min", "$max", "$first", "$last",
  "$multiply", "$divide", "$add", "$subtract", "$abs", "$round", "$floor", "$ceil",
  "$concat", "$toLower", "$toUpper", "$trim", "$substr", "$split",
  "$ifNull", "$cond", "$switch", "$arrayElemAt", "$slice", "$filter", "$map", "$reduce",
  "$dateToString", "$year", "$month", "$dayOfMonth", "$toString", "$toInt",
];

// 値の位置で使える mongosh 風ヘルパー（mongoExpr.ts の MONGO_SHELL_GLOBALS と対応）
const HELPER_DEFS: { name: string; args: string; caret: number; detail: string }[] = [
  { name: "ObjectId", args: '("")', caret: 2, detail: "ObjectId(hex)" },
  { name: "ISODate", args: '("")', caret: 2, detail: "ISODate(iso8601)" },
  { name: "NumberLong", args: '("")', caret: 2, detail: "NumberLong(n)" },
  { name: "NumberInt", args: "()", caret: 1, detail: "NumberInt(n)" },
];

/** 文字列リテラル・括弧を考慮して、カーソル位置を直接囲む括弧と、文字列内かどうかを返す */
export function scanEnclosing(before: string): { top: string | null; inString: boolean } {
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if ("{[(".includes(ch)) {
      stack.push(ch);
    } else if ("}])".includes(ch)) {
      stack.pop();
    }
  }
  return { top: stack.length ? stack[stack.length - 1] : null, inString: quote !== null };
}

/**
 * カーソル位置の補完コンテキストを判定する。
 * `force`（Ctrl+Space）のときは入力中トークンが空でも候補を出す。
 */
export function getAssistContext(text: string, pos: number, mode: AssistMode, force = false): AssistContext {
  const before = text.slice(0, pos);

  if (mode === "query") {
    // db.XXX の途中（コレクション名補完）
    const colMatch = before.match(/\bdb\.(\w*)$/);
    if (colMatch) return { kind: "collection", token: colMatch[1] };
    // db.col.XXX の途中（メソッド名補完）
    const methMatch = before.match(/\bdb\.(\w+)\.(\w*)$/);
    if (methMatch) return { kind: "method", token: methMatch[2], collection: methMatch[1] };
  }

  const token = before.match(/[\w$.]*$/)?.[0] ?? "";
  const collection = mode === "query" ? text.match(/\bdb\.(\w+)\./)?.[1] : undefined;

  if (token.startsWith("$")) return { kind: "operator", token, collection };

  // トークンの直前の非空白文字と、直接囲んでいる括弧から「キー位置」か「値位置」かを判定する
  const head = before.slice(0, before.length - token.length);
  const prev = head.trimEnd().slice(-1);
  const { top, inString } = scanEnclosing(head);

  const keyPosition = top === "{" && (prev === "{" || prev === ",");
  if (keyPosition && (token.length >= 1 || force)) return { kind: "field", token, collection };

  const valuePosition = prev === ":" || (top === "[" && (prev === "[" || prev === ","));
  if (valuePosition && !inString && (token.length >= 1 || force)) return { kind: "helper", token, collection };

  return { kind: "none", token: "", collection };
}

/** 前方一致を優先し、次に部分一致（大文字小文字は区別しない）で絞り込む */
export function rankMatches(items: string[], token: string, limit = 10): string[] {
  const t = token.toLowerCase();
  const starts: string[] = [];
  const contains: string[] = [];
  for (const it of items) {
    const l = it.toLowerCase();
    if (l === t) continue;
    if (l.startsWith(t)) starts.push(it);
    else if (t && l.includes(t)) contains.push(it);
  }
  return [...starts, ...contains].slice(0, limit);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** フィールド名をキー位置に挿入する形へ（識別子でなければ引用符付き。ドット区切りはそのまま） */
function fieldInsert(name: string): string {
  return name.split(".").every(p => IDENTIFIER.test(p) || /^\d+$/.test(p)) ? name : JSON.stringify(name);
}

export interface AssistSources {
  collections: string[];
  /** コレクションのフィールド名（ドット区切りのネストパス含む） */
  fields: string[];
}

/** コンテキストと補完元データから候補を作る */
export function buildCandidates(
  ctx: AssistContext,
  src: AssistSources,
  nextChar: string,
): Candidate[] {
  switch (ctx.kind) {
    case "collection":
      return rankMatches(src.collections, ctx.token).map(c => ({ label: c, insert: c }));
    case "method": {
      const names = rankMatches(METHOD_DEFS.map(m => m.name), ctx.token);
      return names.map(name => {
        const def = METHOD_DEFS.find(m => m.name === name)!;
        // 既に "(" がある場合は名前だけ置き換える
        if (nextChar === "(") return { label: name, insert: name };
        return { label: name, insert: name + def.args, caret: name.length + def.caret, detail: def.args };
      });
    }
    case "operator":
      return rankMatches(OPERATORS, ctx.token).map(o => ({ label: o, insert: o }));
    case "field":
      return rankMatches(src.fields, ctx.token).map(f => ({ label: f, insert: fieldInsert(f) }));
    case "helper": {
      const names = rankMatches(HELPER_DEFS.map(h => h.name), ctx.token);
      return names.map(name => {
        const def = HELPER_DEFS.find(h => h.name === name)!;
        if (nextChar === "(") return { label: name, insert: name, detail: def.detail };
        return { label: name, insert: name + def.args, caret: name.length + def.caret, detail: def.detail };
      });
    }
    default:
      return [];
  }
}

/** 候補を適用した結果のテキストとカーソル位置 */
export function applyCandidate(
  text: string,
  pos: number,
  token: string,
  cand: Candidate,
): { text: string; caret: number } {
  const start = pos - token.length;
  return {
    text: text.slice(0, start) + cand.insert + text.slice(pos),
    caret: start + (cand.caret ?? cand.insert.length),
  };
}
