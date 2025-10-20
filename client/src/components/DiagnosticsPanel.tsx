import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useLocale } from "../state/LocaleContext";

export function DiagnosticsPanel({ onClose }: { onClose?: () => void }) {
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Record<string, unknown>>("fetch_backend_health");
      setPayload(result);
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
        <ul className="panel__list">
          {Object.entries(payload).map(([key, value]) => (
            <li key={key} className="panel__list-item">
              <div>
                <strong>{key}</strong>
                <span className="panel__list-subtitle">{String(value)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
