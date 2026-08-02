import { useState } from "react";
import { useI18n } from "../i18n";
import { Messages } from "../i18n";
import { ConnectError, ConnectStage, ConnectStageStatus } from "../types";
import { connectErrorReasonKey } from "../connectDiagnostics";

const STAGE_LABEL_KEY: Record<ConnectStage, keyof Messages> = {
  ssh: "connectStageSsh",
  tcp: "connectStageTcp",
  mongo: "connectStageMongo",
};

function stageIcon(status: ConnectStageStatus | undefined): { char: string; color: string } {
  if (status === "ok") return { char: "✓", color: "var(--green)" };
  if (status === "error") return { char: "✗", color: "var(--red)" };
  if (status === "start") return { char: "…", color: "var(--accent)" };
  return { char: "○", color: "var(--text-muted)" };
}

export function ConnectDiagnostics({
  sshEnabled,
  progress,
  error,
}: {
  sshEnabled: boolean;
  progress: Partial<Record<ConnectStage, ConnectStageStatus>>;
  error: ConnectError | null;
}) {
  const { t } = useI18n();
  const [showDetail, setShowDetail] = useState(false);
  const stages: ConnectStage[] = sshEnabled ? ["ssh", "tcp", "mongo"] : ["tcp", "mongo"];

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: error ? 4 : 0 }}>
        {stages.map(stage => {
          const icon = stageIcon(progress[stage]);
          return (
            <span key={stage} style={{ color: icon.color, display: "flex", alignItems: "center", gap: 3 }}>
              <span>{icon.char}</span>
              <span>{t[STAGE_LABEL_KEY[stage]]}</span>
            </span>
          );
        })}
      </div>
      {error && (
        <div style={{ color: "var(--red)" }}>
          <div>{t[connectErrorReasonKey(error)]}</div>
          <div
            onClick={() => setShowDetail(v => !v)}
            style={{ cursor: "pointer", color: "var(--text-muted)", marginTop: 2, textDecoration: "underline" }}
          >
            {showDetail ? t.connectHideDetail : t.connectShowDetail}
          </div>
          {showDetail && (
            <div style={{
              marginTop: 2, padding: 6, background: "var(--bg3)", borderRadius: 4,
              fontFamily: "monospace", wordBreak: "break-all", whiteSpace: "pre-wrap",
              maxHeight: 160, overflow: "auto", color: "var(--text-muted)",
            }}>
              {error.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
