
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useAppState } from "../state/AppState";
import { expandTerm, type TermExpansionResult } from "../lib/llmClient";
import { useLocale } from "../state/LocaleContext";

type StoredTerm = {
  id: number;
  term: string;
  definition: string;
  definition_cn: string | null;
  review_stage: number;
  last_reviewed_at: string | null;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

const REVIEW_BATCH_SIZE = 20;

type GlobalTermbaseViewProps = {
  refreshToken?: number;
  onReviewCountChange?: (count: number) => void;
};

export function GlobalTermbaseView({ refreshToken = 0, onReviewCountChange }: GlobalTermbaseViewProps) {
  const { refreshGlobalTerms } = useAppState();
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [terms, setTerms] = useState<StoredTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ term: "", definition: "", definition_cn: "" });
  const [savingId, setSavingId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [reviewDueCount, setReviewDueCount] = useState(0);
  const [expansionCache, setExpansionCache] = useState<Record<number, TermExpansionResult>>({});
  const [activeExpansion, setActiveExpansion] = useState<StoredTerm | null>(null);
  const [expansionDomain, setExpansionDomain] = useState("");
  const [lastExpansionDomain, setLastExpansionDomain] = useState("");
  const [expansionResult, setExpansionResult] = useState<TermExpansionResult | null>(null);
  const [expansionLoading, setExpansionLoading] = useState(false);
  const [expansionError, setExpansionError] = useState<string | null>(null);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await invoke<StoredTerm[]>("get_all_terms");
      setTerms(payload);
      refreshGlobalTerms().catch(() => {
        /* already logged in provider */
      });
      try {
        const summary = await invoke<StoredTerm[]>("get_review_terms", { limit: REVIEW_BATCH_SIZE });
        setReviewDueCount(summary.length);
        onReviewCountChange?.(summary.length);
      } catch {
        setReviewDueCount(0);
        onReviewCountChange?.(0);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [onReviewCountChange, refreshGlobalTerms]);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  useEffect(() => {
    if (refreshToken <= 0) {
      return;
    }
    loadTerms();
  }, [refreshToken, loadTerms]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    onReviewCountChange?.(reviewDueCount);
  }, [onReviewCountChange, reviewDueCount]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTerms = useMemo(() => {
    if (!normalizedQuery) {
      return terms;
    }
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return terms;
    }
    return terms.filter((entry) => {
      const haystack = `${entry.term} ${entry.definition} ${entry.definition_cn ?? ""}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [terms, normalizedQuery]);

  const beginEdit = useCallback((record: StoredTerm) => {
    setEditingId(record.id);
    setDraft({
      term: record.term,
      definition: record.definition,
      definition_cn: record.definition_cn ?? "",
    });
    setToast(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft({ term: "", definition: "", definition_cn: "" });
  }, []);

  const handleDraftChange = (field: "term" | "definition" | "definition_cn") =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft((prev) => ({ ...prev, [field]: value }));
    };

  const handleSaveEdit = useCallback(
    async (id: number) => {
      const trimmedTerm = draft.term.trim();
      const trimmedDefinition = draft.definition.trim();
      const trimmedDefinitionCn = draft.definition_cn.trim();
      if (!trimmedTerm) {
        setToast({
          kind: "error",
          message: isChinese ? "术语不能为空。" : "Term cannot be empty.",
        });
        return;
      }

      setSavingId(id);
      setError(null);
      try {
        await invoke("update_term", {
          id,
          term: trimmedTerm,
          definition: trimmedDefinition,
          definition_cn: trimmedDefinitionCn,
        });
        setTerms((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  term: trimmedTerm,
                  definition: trimmedDefinition,
                  definition_cn: trimmedDefinitionCn,
                }
              : entry,
          ),
        );
        setToast({
          kind: "success",
          message: isChinese ? `已更新 ${trimmedTerm}。` : `Updated ${trimmedTerm}.`,
        });
        cancelEdit();
        refreshGlobalTerms().catch(() => {
          /* ignore */
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingId(null);
      }
    },
    [cancelEdit, draft.definition, draft.definition_cn, draft.term, isChinese, refreshGlobalTerms],
  );

  const deleteTerm = useCallback(
    async (id: number) => {
      setSavingId(id);
      setError(null);
      try {
        await invoke("delete_term", { id });
        setTerms((prev) => prev.filter((entry) => entry.id !== id));
        setToast({
          kind: "success",
          message: isChinese ? "已删除该术语。" : "Term deleted.",
        });
        refreshGlobalTerms().catch(() => {
          /* ignore */
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingId(null);
      }
    },
    [isChinese, refreshGlobalTerms],
  );

  const handleExport = useCallback(async () => {
    if (terms.length === 0) {
      setToast({
        kind: "error",
        message: isChinese ? "暂无可导出的术语。" : "No terms available to export.",
      });
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await invoke("export_terms_csv");
      setToast({
        kind: "success",
        message: isChinese ? "CSV 导出完成。" : "CSV export completed.",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
    } finally {
      setExporting(false);
    }
  }, [isChinese, terms.length]);

  const openExpansion = useCallback(
    (record: StoredTerm) => {
      setActiveExpansion(record);
      setExpansionError(null);
      const cached = expansionCache[record.id] ?? null;
      setExpansionResult(cached);
      const domain = lastExpansionDomain.trim();
      setExpansionDomain(domain);
      if (!cached) {
        setExpansionLoading(false);
      }
    },
    [expansionCache, lastExpansionDomain],
  );

  const closeExpansion = useCallback(() => {
    setActiveExpansion(null);
    setExpansionDomain("");
    setExpansionResult(null);
    setExpansionError(null);
    setExpansionLoading(false);
  }, []);

  const handleExpansionDomainChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setExpansionDomain(event.target.value);
  }, []);

  const runExpansion = useCallback(
    async (event?: FormEvent) => {
      if (event) {
        event.preventDefault();
      }
      if (!activeExpansion || expansionLoading) {
        return;
      }

      setExpansionLoading(true);
      setExpansionError(null);
      try {
        const payload = await expandTerm({
          term: activeExpansion.term,
          definition: activeExpansion.definition,
          definitionCn: activeExpansion.definition_cn ?? undefined,
          domain: expansionDomain,
        });
        setExpansionResult(payload);
        setExpansionCache((prev) => ({ ...prev, [activeExpansion.id]: payload }));
        const trimmedDomain = expansionDomain.trim();
        if (trimmedDomain) {
          setLastExpansionDomain(trimmedDomain);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        if (isChinese) {
          if (detail.includes("incomplete expansion data")) {
            setExpansionError("AI 返回的数据不完整，请稍后重试或更换模型。");
          } else if (detail.toLowerCase().includes("json")) {
            setExpansionError("解析 AI 返回的内容时出错，请重试。" );
          } else {
            setExpansionError(detail);
          }
        } else {
          setExpansionError(detail);
        }
      } finally {
        setExpansionLoading(false);
      }
    },
    [activeExpansion, expansionDomain, expansionLoading, isChinese],
  );

  useEffect(() => {
    if (!activeExpansion) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activeExpansion]);

  return (
    <>
      <section className="panel global-view">
        <header className="panel__header">
          <div>
            <h2>{isChinese ? "全局术语库" : "Global Termbase"}</h2>
            <p className="panel__subtitle">
              {isChinese ? "你的个性化术语知识库。" : "Your personalised terminology vault."}
            </p>
            <p className="termbase-review-summary">
              {loading ? (
                isChinese ? "正在统计今日复习任务…" : "Calculating today’s review queue…"
              ) : reviewDueCount > 0 ? (
                isChinese ? (
                  <>
                    今日待复习 <strong>{reviewDueCount}</strong> 个术语
                  </>
                ) : (
                  <>
                    <strong>{reviewDueCount}</strong> terms ready for review today
                  </>
                )
              ) : isChinese ? (
                "今日复习任务已完成"
              ) : (
                "You’re all caught up for today"
              )}
            </p>
          </div>
          <div className="termbase-toolbar">
            <div className="termbase-search">
              <input
                type="search"
                value={query}
                onChange={handleSearchChange}
                placeholder="Search term or definition"
                aria-label="Search global termbase"
              />
            </div>
            <button
              type="button"
              className="pill-button"
              onClick={loadTerms}
              disabled={loading}
            >
              {loading
                ? isChinese
                  ? "正在刷新…"
                  : "Refreshing…"
                : isChinese
                ? "刷新"
                : "Refresh"}
            </button>
            <button
              type="button"
              className="pill-button"
              onClick={handleExport}
              disabled={exporting || terms.length === 0}
              aria-busy={exporting}
            >
              {exporting
                ? isChinese
                  ? "正在导出…"
                  : "Exporting…"
                : isChinese
                ? "导出 CSV"
                : "Export CSV"}
            </button>
          </div>
        </header>
        {toast && <div className={`panel-toast ${toast.kind}`}>{toast.message}</div>}
        {error && <p className="panel__status error">{error}</p>}
        {loading && <p className="panel__status">{isChinese ? "正在加载术语…" : "Loading terms…"}</p>}
        {!loading && filteredTerms.length === 0 && (
          <div className="termbase-empty">
            <h3>
              {normalizedQuery
                ? isChinese
                  ? `没有找到 “${query}” 的匹配结果`
                  : `No matches for "${query}"`
                : isChinese
                ? "你的术语库还是空的"
                : "Your termbase is empty"}
            </h3>
            <p>
              {normalizedQuery
                ? isChinese
                  ? "试试调整搜索关键词，或清空搜索查看全部术语。"
                  : "Try adjusting your search keywords or reset to see all terms."
                : isChinese
                ? "运行对话式引导或保存提取的术语，丰富你的知识库。"
                : "Run onboarding or save extracted terms to build your knowledge base."}
            </p>
          </div>
        )}
        {!loading && filteredTerms.length > 0 && (
          <table className="term-table">
            <thead>
              <tr>
                  <th className="term-table__id" aria-hidden="true">ID</th>
                  <th>{isChinese ? "术语" : "Term"}</th>
                  <th>{isChinese ? "释义" : "Definition"}</th>
                  <th>{isChinese ? "中文释义" : "Definition (ZH)"}</th>
                  <th>{isChinese ? "操作" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTerms.map((record) => {
                const isEditing = editingId === record.id;
                const isSaving = savingId === record.id;
                return (
                  <tr key={record.id}>
                    <td className="term-table__id" aria-hidden="true">{record.id}</td>
                    <td>
                      {isEditing ? (
                        <input
                          className="term-table__input"
                          value={draft.term}
                          onChange={handleDraftChange("term")}
                          disabled={isSaving}
                        />
                      ) : (
                        record.term
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <textarea
                          className="term-table__textarea"
                          value={draft.definition}
                          onChange={handleDraftChange("definition")}
                          disabled={isSaving}
                        />
                      ) : (
                        record.definition
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <textarea
                          className="term-table__textarea"
                          value={draft.definition_cn}
                          onChange={handleDraftChange("definition_cn")}
                          disabled={isSaving}
                          placeholder="提供最精炼的中文释义"
                        />
                      ) : (
                        record.definition_cn ?? "—"
                      )}
                    </td>
                    <td>
                      <div className="termbase-row-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(record.id)}
                              disabled={isSaving}
                            >
                            {isSaving
                              ? isChinese
                                ? "正在保存…"
                                : "Saving…"
                              : isChinese
                              ? "保存"
                              : "Save"}
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={cancelEdit}
                              disabled={isSaving}
                            >
                            {isChinese ? "取消" : "Cancel"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => openExpansion(record)}>
                              {isChinese ? "术语联想" : "Deep dive"}
                            </button>
                            <button type="button" onClick={() => beginEdit(record)}>
                            {isChinese ? "编辑" : "Edit"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTerm(record.id)}
                              disabled={isSaving}
                            >
                            {isChinese ? "删除" : "Delete"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {activeExpansion && (
        <div className="deep-dive-overlay" role="dialog" aria-modal="true">
          <div className="deep-dive-panel">
            <header className="deep-dive-header">
              <div>
                <h3>{activeExpansion.term}</h3>
                <p>
                  {isChinese
                    ? "深入理解该术语的使用场景与关联知识。可选填入领域，AI 将提供更贴切的联想。"
                    : "Deep dive into this term’s context and discover related knowledge. Provide an optional domain to tailor AI insights."}
                </p>
              </div>
              <div className="deep-dive-actions">
                <button type="button" className="ghost-button" onClick={closeExpansion}>
                  {isChinese ? "关闭" : "Close"}
                </button>
                <button
                  type="button"
                  className="pill-button"
                  onClick={() => runExpansion()}
                  disabled={expansionLoading}
                >
                  {expansionLoading
                    ? isChinese
                      ? "正在生成…"
                      : "Generating…"
                    : isChinese
                    ? "生成联想"
                    : "Generate insights"}
                </button>
              </div>
            </header>
            <div className="deep-dive-body">
              <section className="deep-dive-context">
                <h4>Current definition</h4>
                <p>{activeExpansion.definition}</p>
                {activeExpansion.definition_cn && (
                  <p className="deep-dive-context__cn">{activeExpansion.definition_cn}</p>
                )}
                <form className="deep-dive-domain" onSubmit={runExpansion}>
                  <label>
                    {isChinese ? "聚焦领域（可选）" : "Domain focus (optional)"}
                    <input
                      type="text"
                      placeholder=
                        {isChinese
                          ? "例如：AI 安全研究、金融合规"
                          : "e.g. AI safety research, financial compliance"}
                      value={expansionDomain}
                      onChange={handleExpansionDomainChange}
                      disabled={expansionLoading}
                    />
                  </label>
                  <p className="deep-dive-helper">
                    {isChinese
                      ? "指定行业或场景，AI 会提供更贴切的内容。"
                      : "Tailor the AI output by specifying the industry or scenario you care about."}
                  </p>
                </form>
                {expansionError && <p className="panel__status error">{expansionError}</p>}
              </section>
              <section className="deep-dive-results" aria-busy={expansionLoading}>
                {expansionLoading && (
                  <p className="panel__status">
                    {isChinese ? "正在生成术语联想内容…" : "Generating deep-dive insights…"}
                  </p>
                )}
                {!expansionLoading && expansionResult && (
                  <div className="deep-dive-content">
                    <div>
                      <h4>{isChinese ? "使用场景" : "Usage scenario"}</h4>
                      <p>{expansionResult.usage_scenario}</p>
                    </div>
                    <div>
                      <h4>{isChinese ? "示例句" : "Example sentences"}</h4>
                      <ul>
                        {expansionResult.example_sentences.map((sentence, index) => (
                          <li key={index}>{sentence}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4>{isChinese ? "关联术语" : "Related terms"}</h4>
                      <ul>
                        {expansionResult.related_terms.map((entry, index) => (
                          <li key={index}>
                            <strong>{entry.term}</strong>
                            <span> — {entry.relationship}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {!expansionLoading && !expansionResult && !expansionError && (
                  <p className="panel__status">Provide a domain focus and generate to explore this term. 输入聚焦领域后点击生成，探索更多关联内容。</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
