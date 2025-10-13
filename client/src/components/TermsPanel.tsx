
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { TermDefinition, useAppState } from "../state/AppState";
import { useLocale } from "../state/LocaleContext";

type StoredTerm = {
  id: number;
  term: string;
  definition: string;
  definition_cn: string | null;
  review_stage: number;
  last_reviewed_at: string | null;
};

export function TermsPanel() {
  const { documentId, terms, selectedTerm, setSelectedTerm, setContexts, refreshGlobalTerms } =
    useAppState();
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [loadingTerm, setLoadingTerm] = useState<string | null>(null);
  const [savingTerm, setSavingTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<{
    id: number;
    entry: TermDefinition;
  } | null>(null);

  useEffect(() => {
    setInfoMessage(null);
    setDuplicateCandidate(null);
  }, [terms]);

  const fetchContexts = useCallback(
    async (term: string) => {
      if (!documentId) {
        setError(isChinese ? "请先上传并选中文档，再查看语境。" : "Upload a document before requesting contexts.");
        return;
      }

      setLoadingTerm(term);
      setError(null);
      setInfoMessage(null);
      setSelectedTerm(term);
      setContexts([]);
      try {
        const contexts = await invoke<string[]>("search_term_contexts", {
          doc_id: documentId,
          term,
        });
        setContexts(contexts);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setLoadingTerm(null);
      }
    },
    [documentId, isChinese, setContexts, setSelectedTerm],
  );

  const saveTerm = useCallback(
    async (entry: TermDefinition) => {
      const trimmedTerm = entry.term.trim();
      if (!trimmedTerm) {
        return;
      }

      setSavingTerm(trimmedTerm);
      setError(null);
      setInfoMessage(null);
      try {
        const existing = await invoke<StoredTerm | null>("find_term_by_name", {
          term: trimmedTerm,
        });

        if (existing) {
          setDuplicateCandidate({ id: existing.id, entry });
        setInfoMessage(
          isChinese
            ? `术语 ${trimmedTerm} 已存在，可在下方更新定义。`
            : `Term ${trimmedTerm} already exists. You can update its definition below.`,
        );
          return;
        }

        await invoke("add_term", {
          term: entry.term,
          definition: entry.definition,
          definition_cn: entry.definition_cn ?? null,
        });
        setInfoMessage(
          isChinese
            ? `已将术语 ${trimmedTerm} 保存到全局术语库。`
            : `Saved term ${trimmedTerm} to the global database.`,
        );
        await refreshGlobalTerms();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingTerm(null);
      }
    },
    [isChinese, refreshGlobalTerms],
  );

  const updateTerm = useCallback(
    async (candidateId: number, entry: TermDefinition) => {
      setSavingTerm(entry.term);
      setError(null);
      setInfoMessage(null);
      try {
        await invoke("update_term", {
          id: candidateId,
          term: entry.term,
          definition: entry.definition,
          definition_cn: entry.definition_cn ?? null,
        });
        setInfoMessage(
          isChinese
            ? `已更新 ${entry.term} 的释义。`
            : `Updated definition for ${entry.term}.`,
        );
        setDuplicateCandidate(null);
        await refreshGlobalTerms();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingTerm(null);
      }
    },
    [isChinese, refreshGlobalTerms],
  );

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{isChinese ? "提取的术语" : "Extracted Terms"}</h2>
      </header>
      {error && <p className="panel__status error">{error}</p>}
      {infoMessage && <p className="panel__status success">{infoMessage}</p>}
      {loadingTerm && !error && (
        <p className="panel__status">
          {isChinese
            ? `正在为 “${loadingTerm}” 搜集语境…`
            : `Searching contexts for "${loadingTerm}"...`}
        </p>
      )}
      <ul className="panel__list terms-list">
        {terms.length === 0 && <li>{isChinese ? "尚未提取任何术语。" : "No terms extracted yet."}</li>}
        {terms.map((entry) => {
          const isActive = entry.term === selectedTerm;
          const isLoading = loadingTerm === entry.term;
          const isSaving = savingTerm === entry.term;
          const duplicateActive = duplicateCandidate?.entry.term === entry.term;
          return (
            <li
              key={entry.term}
              className={isActive ? "panel__list-item active" : "panel__list-item"}
            >
              <button
                type="button"
                className="term-button"
                onClick={() => fetchContexts(entry.term)}
                disabled={isLoading}
                aria-label={isChinese ? `查看 ${entry.term} 的语境` : `View contexts for ${entry.term}`}
              >
                <span className="term-button__term">{entry.term}</span>
                <span className="term-button__definition">{entry.definition}</span>
                <span className="term-button__cta">{isChinese ? "查看语境" : "View contexts"}</span>
              </button>
              <button
                type="button"
                className="save-button"
                onClick={() =>
                  duplicateActive && duplicateCandidate
                    ? updateTerm(duplicateCandidate.id, entry)
                    : saveTerm(entry)
                }
                disabled={isSaving}
                aria-label={
                  duplicateActive
                    ? isChinese
                      ? `更新 ${entry.term}`
                      : `Update ${entry.term}`
                    : isChinese
                    ? `保存 ${entry.term}`
                    : `Save ${entry.term}`
                }
              >
                {isSaving
                  ? isChinese
                    ? "正在保存…"
                    : "Saving..."
                  : duplicateActive
                  ? isChinese
                    ? "更新释义"
                    : "Update definition"
                  : isChinese
                  ? "保存"
                  : "Save"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
