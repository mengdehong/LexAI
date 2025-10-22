import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useLocale } from "../state/LocaleContext";

export function DiagnosticsPanel({ onClose }: { onClose?: () => void }) {
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const diagnosticsText = useMemo(() => {
    if (!payload) return "";
    const diag = payload["diagnostics"] as any;
    const parts = [
      `running=${diag?.running}`,
      `exit_status=${diag?.exit_status ?? ""}`,
      `stderr_tail=\n${diag?.stderr_tail ?? ""}`,
    ];
    return parts.join("\n");
  }, [payload]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [health, diag] = await Promise.all([
        invoke<Record<string, unknown>>("fetch_backend_health"),
        invoke<Record<string, unknown>>("fetch_backend_diagnostics").catch(() => ({})),
      ]);
      setPayload({ ...(health || {}), diagnostics: diag || {} });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">

      <header className="panel__header">
        <h2>{isChinese ? "诊断信息" : "Diagnostics"}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {isChinese ? "刷新" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await invoke("restart_backend");
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {isChinese ? "重启" : "Restart"}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await invoke("open_logs_dir");
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            {isChinese ? "打开日志目录" : "Open Logs Folder"}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(diagnosticsText);
              } catch (err) {
                console.error("Failed to copy", err);
              }
            }}
          >
            {isChinese ? "复制诊断" : "Copy Diagnostics"}
          </button>
          {onClose && (
            <button type="button" onClick={onClose}>
              {isChinese ? "关闭" : "Close"}
            </button>
          )}
        </div>
      </header>
      {loading && <p className="panel__status">{isChinese ? "正在加载…" : "Loading…"}</p>}
      {error && <p className="panel__status error">{error}</p>}
      {payload && (
        <div className="panel__list" style={{ gap: 12 }}>
          <div className="panel__list-item">
            <div>
              <strong>{isChinese ? "健康状态" : "Health"}</strong>
              <span className="panel__list-subtitle">{JSON.stringify(payload?.result ?? payload)}</span>
            </div>
          </div>
          <div className="panel__list-item">
            <div>
              <strong>{isChinese ? "运行状态" : "Process"}</strong>
              <span className="panel__list-subtitle">
                {(() => {
                  const diag = (payload as any).diagnostics || {};
                  const rs = diag.running ? (isChinese ? "运行中" : "running") : (isChinese ? "已退出" : "exited");
                  const ec = diag.exit_status !== undefined && diag.exit_status !== null ? ` (exit=${diag.exit_status})` : "";
                  return `${rs}${ec}`;
                })()}
              </span>
            </div>
          </div>
          {(() => {
            const diag = (payload as any).diagnostics || {};
            const tail = diag.stderr_tail as string | undefined;
            if (!tail) return null;
            return (
              <div className="panel__list-item" style={{ display: "block" }}>
                <div>
                  <strong>{isChinese ? "错误输出尾部" : "Stderr tail"}</strong>
                </div>
                <pre style={{
                  marginTop: 8,
                  maxHeight: 220,
                  overflow: "auto",
                  background: "var(--surface-alt)",
                  padding: "8px 10px",
                  borderRadius: 8,
                  whiteSpace: "pre-wrap"
                }}>{tail}</pre>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
