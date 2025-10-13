
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useAppState } from "../state/AppState";

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

type ViewMode = "table" | "review";

const REVIEW_BATCH_SIZE = 12;

export function GlobalTermbaseView() {
  const { refreshGlobalTerms } = useAppState();
  const [terms, setTerms] = useState<StoredTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ term: "", definition: "", definition_cn: "" });
  const [savingId, setSavingId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [mode, setMode] = useState<ViewMode>("table");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewTerms, setReviewTerms] = useState<StoredTerm[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await invoke<StoredTerm[]>("get_all_terms");
      setTerms(payload);
      refreshGlobalTerms().catch(() => {
        /* already logged in provider */
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [refreshGlobalTerms]);

  const loadReviewQueue = useCallback(async () => {
    setReviewLoading(true);
    setReviewError(null);
    setSubmittingReview(false);
    setRevealed(false);
    try {
      const payload = await invoke<StoredTerm[]>("get_review_terms", { limit: REVIEW_BATCH_SIZE });
      setReviewTerms(payload);
      setReviewIndex(0);
      if (payload.length === 0) {
        setReviewError("No terms are currently due for review.");
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setReviewError(detail);
      setReviewTerms([]);
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  useEffect(() => {
    if (mode === "review") {
      loadReviewQueue();
    }
  }, [mode, loadReviewQueue]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
        setToast({ kind: "error", message: "Term cannot be empty." });
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
        setToast({ kind: "success", message: `Updated ${trimmedTerm}.` });
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
    [cancelEdit, draft.definition, draft.definition_cn, draft.term, refreshGlobalTerms],
  );

  const deleteTerm = useCallback(
    async (id: number) => {
      setSavingId(id);
      setError(null);
      try {
        await invoke("delete_term", { id });
        setTerms((prev) => prev.filter((entry) => entry.id !== id));
        setToast({ kind: "success", message: "Term deleted." });
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
    [refreshGlobalTerms],
  );

  const handleExport = useCallback(async () => {
    if (terms.length === 0) {
      setToast({ kind: "error", message: "No terms available to export." });
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await invoke("export_terms_csv");
      setToast({ kind: "success", message: "CSV export completed." });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
    } finally {
      setExporting(false);
    }
  }, [terms.length]);

  const enterReviewMode = useCallback(() => {
    setMode("review");
  }, []);

  const exitReviewMode = useCallback(() => {
    setMode("table");
    setReviewTerms([]);
    setReviewIndex(0);
    setReviewError(null);
    setRevealed(false);
  }, []);

  const currentReviewTerm = reviewTerms[reviewIndex] ?? null;

  const handleShowAnswer = useCallback(() => {
    setRevealed(true);
  }, []);

  const handleReviewAction = useCallback(
    async (known: boolean) => {
      if (!currentReviewTerm) {
        return;
      }

      setSubmittingReview(true);
      setReviewError(null);
      try {
        await invoke("submit_review_result", { id: currentReviewTerm.id, known });
        await loadReviewQueue();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setReviewError(detail);
      } finally {
        setSubmittingReview(false);
        setRevealed(false);
      }
    },
    [currentReviewTerm, loadReviewQueue],
  );

  return (
    <section className="panel global-view">
      <header className="panel__header">
        <div>
          <h2>Global Termbase</h2>
          <p className="panel__subtitle">Your personalised terminology vault.</p>
        </div>
        <div className="termbase-toolbar">
          <div className="termbase-search">
            <input
              type="search"
              value={query}
              onChange={handleSearchChange}
              placeholder="Search term or definition"
              aria-label="Search global termbase"
              disabled={mode === "review"}
            />
          </div>
          <button
            type="button"
            className="pill-button"
            onClick={loadTerms}
            disabled={loading || mode === "review"}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="pill-button"
            onClick={handleExport}
            disabled={exporting || terms.length === 0 || mode === "review"}
            aria-busy={exporting}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          {mode === "table" ? (
            <button type="button" className="pill-button" onClick={enterReviewMode}>
              Review mode
            </button>
          ) : (
            <button type="button" className="pill-button" onClick={exitReviewMode}>
              Exit review
            </button>
          )}
        </div>
      </header>
      {toast && <div className={`panel-toast ${toast.kind}`}>{toast.message}</div>}
      {mode === "table" && error && <p className="panel__status error">{error}</p>}
      {mode === "table" && loading && <p className="panel__status">Loading terms…</p>}
      {mode === "table" && !loading && filteredTerms.length === 0 && (
        <div className="termbase-empty">
          <h3>
            {normalizedQuery
              ? `No matches for "${query}"`
              : "Your termbase is empty"}
          </h3>
          <p>
            {normalizedQuery
              ? "Try adjusting your search keywords or reset to see all terms."
              : "Run onboarding or save extracted terms to build your knowledge base."}
          </p>
        </div>
      )}
      {mode === "table" && filteredTerms.length > 0 && (
        <table className="term-table">
          <thead>
            <tr>
              <th className="term-table__id" aria-hidden="true">ID</th>
              <th>Term</th>
              <th>Definition</th>
              <th>中文释义</th>
              <th>Actions</th>
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
                            {isSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={cancelEdit}
                            disabled={isSaving}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => beginEdit(record)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTerm(record.id)}
                            disabled={isSaving}
                          >
                            Delete
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
      {mode === "review" && (
        <div className="review-mode">
          {reviewLoading && <p className="panel__status">Preparing review queue…</p>}
          {reviewError && !reviewLoading && <p className="panel__status error">{reviewError}</p>}
          {!reviewLoading && !reviewError && currentReviewTerm && (
            <div className="review-card">
              <div className="review-card__meta">
                <span className="review-card__stage">Stage {currentReviewTerm.review_stage}</span>
                {currentReviewTerm.last_reviewed_at && (
                  <span className="review-card__timestamp">
                    Last reviewed: {new Date(currentReviewTerm.last_reviewed_at).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="review-card__term">{currentReviewTerm.term}</div>
              {revealed ? (
                <div className="review-card__definition-group">
                  <div className="review-card__definition">{currentReviewTerm.definition}</div>
                  {currentReviewTerm.definition_cn && (
                    <div className="review-card__definition review-card__definition--cn">
                      {currentReviewTerm.definition_cn}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="pill-button review-card__show"
                  onClick={handleShowAnswer}
                  disabled={submittingReview}
                >
                  Show answer
                </button>
              )}
              <div className="review-card__actions">
                <button
                  type="button"
                  className="pill-button negative"
                  onClick={() => handleReviewAction(false)}
                  disabled={submittingReview}
                >
                  {submittingReview ? "Updating…" : "Don't know"}
                </button>
                <button
                  type="button"
                  className="pill-button positive"
                  onClick={() => handleReviewAction(true)}
                  disabled={submittingReview || !revealed}
                >
                  {submittingReview ? "Updating…" : "I know this"}
                </button>
              </div>
            </div>
          )}
          {!reviewLoading && !reviewError && !currentReviewTerm && (
            <p className="panel__status">Nothing to review right now. Come back later!</p>
          )}
        </div>
      )}
    </section>
  );
}
