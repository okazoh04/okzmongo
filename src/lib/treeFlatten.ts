// DocumentTreeの展開状態を反映し、表示対象の行だけを深さ優先の平坦な配列にする。
// 行コンポーネントの再帰ネストをやめて配列インデックスをそのまま行番号として渡せるようにするための変換。
// （再帰コンポーネント側で行番号を数える方式だと、1行だけがローカルstateで再描画された際に
// 　共有カウンタが余分に進んでしまい、縞模様の色がホバーのたびにズレる不具合があった）
import { inferType } from "./bsonTypes";
import { joinPath } from "./treePath";

export type FlatTreeItem =
  | { kind: "field"; path: string; fieldKey: string; value: unknown; depth: number; isArrayItem: boolean }
  | { kind: "add"; parentPath: string; parentType: "object" | "array"; depth: number };

function containerEntries(container: unknown, containerType: "object" | "array"): [string | number, unknown][] {
  if (containerType === "array") return (container as unknown[]).map((v, i) => [i, v]);
  return Object.entries(container as Record<string, unknown>);
}

export function flattenTree(
  root: Record<string, unknown>,
  expandedPaths: Set<string>,
  readOnly: boolean
): FlatTreeItem[] {
  const out: FlatTreeItem[] = [];

  function walk(container: unknown, containerType: "object" | "array", containerPath: string, depth: number) {
    for (const [key, val] of containerEntries(container, containerType)) {
      const path = joinPath(containerPath, key);
      const fieldKey = typeof key === "number" ? `[${key}]` : key;
      out.push({ kind: "field", path, fieldKey, value: val, depth, isArrayItem: containerType === "array" });
      const childType = inferType(val);
      if ((childType === "object" || childType === "array") && expandedPaths.has(path)) {
        walk(val, childType, path, depth + 1);
        if (!readOnly) out.push({ kind: "add", parentPath: path, parentType: childType, depth: depth + 1 });
      }
    }
  }

  walk(root, "object", "", 0);
  if (!readOnly) out.push({ kind: "add", parentPath: "", parentType: "object", depth: 0 });
  return out;
}
