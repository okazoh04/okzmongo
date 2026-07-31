import { EnvironmentTier } from "./types";
import { Messages } from "./i18n";

export type PermissionLevel = "allow" | "warn" | "block";

export type OperationKey =
  | "insertDoc"
  | "updateDoc"
  | "deleteDoc"
  | "dropCollection"
  | "importCollection"
  | "restoreDatabase"
  | "queryWrite";

export type PolicyMatrix = Record<EnvironmentTier, Record<OperationKey, PermissionLevel>>;

export const ENVIRONMENT_TIERS: EnvironmentTier[] = ["production", "staging", "development"];

export const OPERATION_KEYS: OperationKey[] = [
  "insertDoc",
  "updateDoc",
  "deleteDoc",
  "dropCollection",
  "importCollection",
  "restoreDatabase",
  "queryWrite",
];

export const DEFAULT_POLICY: PolicyMatrix = {
  production: {
    insertDoc: "warn",
    updateDoc: "warn",
    deleteDoc: "warn",
    dropCollection: "warn",
    importCollection: "block",
    restoreDatabase: "block",
    queryWrite: "warn",
  },
  staging: {
    insertDoc: "allow",
    updateDoc: "allow",
    deleteDoc: "warn",
    dropCollection: "warn",
    importCollection: "warn",
    restoreDatabase: "warn",
    queryWrite: "allow",
  },
  development: {
    insertDoc: "allow",
    updateDoc: "allow",
    deleteDoc: "allow",
    dropCollection: "allow",
    importCollection: "allow",
    restoreDatabase: "allow",
    queryWrite: "allow",
  },
};

const STORAGE_KEY = "okzmongo-policy";

export function loadPolicy(): PolicyMatrix {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POLICY;
    const parsed = JSON.parse(raw) as Partial<PolicyMatrix>;
    const merged = {} as PolicyMatrix;
    for (const env of ENVIRONMENT_TIERS) {
      merged[env] = { ...DEFAULT_POLICY[env], ...(parsed[env] ?? {}) };
    }
    return merged;
  } catch {
    return DEFAULT_POLICY;
  }
}

export function savePolicy(policy: PolicyMatrix): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
}

export const PERMISSION_LEVELS: PermissionLevel[] = ["allow", "warn", "block"];

export const ENV_LABEL_KEY: Record<EnvironmentTier, keyof Messages> = {
  production: "envProduction",
  staging: "envStaging",
  development: "envDevelopment",
};

export const OP_LABEL_KEY: Record<OperationKey, keyof Messages> = {
  insertDoc: "policyOpInsertDoc",
  updateDoc: "policyOpUpdateDoc",
  deleteDoc: "policyOpDeleteDoc",
  dropCollection: "policyOpDropCollection",
  importCollection: "policyOpImportCollection",
  restoreDatabase: "policyOpRestoreDatabase",
  queryWrite: "policyOpQueryWrite",
};

export const PERMISSION_LABEL_KEY: Record<PermissionLevel, keyof Messages> = {
  allow: "policyLevelAllow",
  warn: "policyLevelWarn",
  block: "policyLevelBlock",
};

export const ENV_COLOR: Record<EnvironmentTier, string> = {
  production: "var(--red)",
  staging: "var(--yellow)",
  development: "var(--green)",
};

export function getPermission(
  policy: PolicyMatrix,
  env: EnvironmentTier,
  op: OperationKey
): PermissionLevel {
  return policy[env]?.[op] ?? "allow";
}
