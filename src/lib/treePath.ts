// ツリー展開状態・値の読み書きに使うパスユーティリティ。
// パス表現は "user.addresses[0].city" 形式のドット+ブラケット記法。ルートは空文字列。

export function parsePathSegments(path: string): (string | number)[] {
  if (!path) return [];
  const result: (string | number)[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) result.push(m[1]);
    else result.push(Number(m[2]));
  }
  return result;
}

function joinSegments(segments: (string | number)[]): string {
  let out = "";
  for (const seg of segments) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out ? `.${seg}` : seg;
  }
  return out;
}

export function joinPath(parent: string, key: string | number): string {
  if (typeof key === "number") return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

export function getAtPath(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const seg of parsePathSegments(path)) {
    if (cur == null) return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function setRecursive(cur: unknown, segments: (string | number)[], value: unknown): unknown {
  const [head, ...rest] = segments;
  if (typeof head === "number") {
    const copy = Array.isArray(cur) ? [...cur] : [];
    copy[head] = rest.length === 0 ? value : setRecursive(copy[head], rest, value);
    return copy;
  }
  const copy = { ...((cur as Record<string, unknown>) ?? {}) };
  copy[head] = rest.length === 0 ? value : setRecursive(copy[head], rest, value);
  return copy;
}

/** イミュータブルに複製しながら指定パスへ値をセットした新しいドキュメントを返す */
export function setAtPath(doc: unknown, path: string, value: unknown): unknown {
  const segments = parsePathSegments(path);
  if (segments.length === 0) return value;
  return setRecursive(doc, segments, value);
}

/** イミュータブルに複製しながら指定パスを削除した新しいドキュメントを返す */
export function deleteAtPath(doc: unknown, path: string): unknown {
  const segments = parsePathSegments(path);
  if (segments.length === 0) return doc;
  const parentSegments = segments.slice(0, -1);
  const lastKey = segments[segments.length - 1];
  const parentPath = joinSegments(parentSegments);
  const parent = parentSegments.length === 0 ? doc : getAtPath(doc, parentPath);

  const removeKey = (target: unknown): unknown => {
    if (typeof lastKey === "number" && Array.isArray(target)) {
      const copy = [...target];
      copy.splice(lastKey, 1);
      return copy;
    }
    const copy = { ...((target as Record<string, unknown>) ?? {}) };
    delete copy[lastKey as string];
    return copy;
  };

  if (parentSegments.length === 0) return removeKey(parent);
  return setRecursive(doc, parentSegments, removeKey(parent));
}

/**
 * 指定パスの末尾キーをリネームする。挿入順を維持したまま新しいドキュメントを返す。
 * 配列要素（末尾がインデックス）や、リネーム先が親内で既に使われている場合は null を返す。
 */
export function renameKeyAtPath(
  doc: unknown,
  path: string,
  newKey: string
): { doc: unknown; newPath: string } | null {
  const segments = parsePathSegments(path);
  if (segments.length === 0) return null;
  const oldKey = segments[segments.length - 1];
  if (typeof oldKey === "number") return null;
  const parentSegments = segments.slice(0, -1);
  const parentPath = joinSegments(parentSegments);
  const parent = parentSegments.length === 0 ? doc : getAtPath(doc, parentPath);
  const parentObj = (parent as Record<string, unknown>) ?? {};

  if (oldKey === newKey) return { doc, newPath: path };
  if (Object.prototype.hasOwnProperty.call(parentObj, newKey)) return null;

  const renamedParent: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parentObj)) {
    renamedParent[k === oldKey ? newKey : k] = v;
  }
  const newDoc =
    parentSegments.length === 0 ? renamedParent : setRecursive(doc, parentSegments, renamedParent);
  return { doc: newDoc, newPath: joinPath(parentPath, newKey) };
}
