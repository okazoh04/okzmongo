import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { EnvironmentTier } from "./types";
import {
  OperationKey, PolicyMatrix, loadPolicy, savePolicy, getPermission,
  ENV_LABEL_KEY, OP_LABEL_KEY, ENV_COLOR,
} from "./policy";
import { useI18n } from "./i18n";

interface PendingGuard {
  env: EnvironmentTier;
  op: OperationKey;
  level: "warn" | "block";
  resolve: (v: boolean) => void;
}

interface PolicyContextValue {
  policy: PolicyMatrix;
  setPolicy: (p: PolicyMatrix) => void;
  guard: (env: EnvironmentTier, op: OperationKey) => Promise<boolean>;
}

const PolicyContext = createContext<PolicyContextValue | null>(null);

export function usePolicy(): PolicyContextValue {
  const ctx = useContext(PolicyContext);
  if (!ctx) throw new Error("usePolicy must be used within PolicyProvider");
  return ctx;
}

export function PolicyProvider({ children }: { children: ReactNode }) {
  const { t, tpl } = useI18n();
  const [policy, setPolicyState] = useState<PolicyMatrix>(loadPolicy);
  const [pending, setPending] = useState<PendingGuard | null>(null);

  const setPolicy = useCallback((p: PolicyMatrix) => {
    savePolicy(p);
    setPolicyState(p);
  }, []);

  const guard = useCallback(
    (env: EnvironmentTier, op: OperationKey): Promise<boolean> => {
      const level = getPermission(policy, env, op);
      if (level === "allow") return Promise.resolve(true);
      return new Promise<boolean>(resolve => {
        setPending({ env, op, level, resolve });
      });
    },
    [policy]
  );

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <PolicyContext.Provider value={{ policy, setPolicy, guard }}>
      {children}
      {pending && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={e => { if (e.target === e.currentTarget) close(false); }}
        >
          <div style={{
            background: "var(--bg2)",
            border: `2px solid ${ENV_COLOR[pending.env]}`,
            borderRadius: 8,
            width: 420,
            maxWidth: "90vw",
            padding: 20,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
              color: ENV_COLOR[pending.env], fontWeight: 700, fontSize: 14,
            }}>
              <span>{pending.level === "block" ? "⛔" : "⚠"}</span>
              <span>{pending.level === "block" ? t.policyBlockedTitle : t.policyWarnTitle}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 16, lineHeight: 1.6 }}>
              {tpl(pending.level === "block" ? t.policyBlockedMessage : t.policyWarnMessage, {
                op: t[OP_LABEL_KEY[pending.op]],
                env: t[ENV_LABEL_KEY[pending.env]],
              })}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {pending.level === "block" ? (
                <button onClick={() => close(false)}>{t.close}</button>
              ) : (
                <>
                  <button onClick={() => close(false)}>{t.cancel}</button>
                  <button
                    onClick={() => close(true)}
                    style={{ background: "var(--red)", color: "white", fontWeight: 600 }}
                  >
                    {t.policyProceed}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PolicyContext.Provider>
  );
}
