
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

type StoredTerm = {
  id: number;
  term: string;
  definition: string;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

export function GlobalTermbaseView() {
  const [terms, setTerms] = useState<StoredTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ term: "", definition: "" });
  const [savingId, setSavingId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await invoke<StoredTerm[]>("get_all_terms");
      setTerms(payload);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

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
      const haystack = `${entry.term} ${entry.definition}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [terms, normalizedQuery]);

  const beginEdit = useCallback((record: StoredTerm) => {
    setEditingId(record.id);
    setDraft({ term: record.term, definition: record.definition });
    setToast(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft({ term: "", definition: "" });
  }, []);

  const handleDraftChange = (field: "term" | "definition") =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft((prev) => ({ ...prev, [field]: value }));
    };

  const handleSaveEdit = useCallback(
    async (id: number) => {
      const trimmedTerm = draft.term.trim();
      const trimmedDefinition = draft.definition.trim();
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
        });
        setTerms((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? { ...entry, term: trimmedTerm, definition: trimmedDefinition }
              : entry,
          ),
        );
        setToast({ kind: "success", message: `Updated ${trimmedTerm}.` });
        cancelEdit();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingId(null);
      }
    },
    [cancelEdit, draft.definition, draft.term],
  );

  const deleteTerm = useCallback(
    async (id: number) => {
      setSavingId(id);
      setError(null);
      try {
        await invoke("delete_term", { id });
        setTerms((prev) => prev.filter((entry) => entry.id !== id));
        setToast({ kind: "success", message: "Term deleted." });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingId(null);
      }
    },
    [],
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
            />
          </div>
          <button type="button" className="pill-button" onClick={loadTerms} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="pill-button"
            onClick={handleExport}
            disabled={exporting || terms.length === 0}
            aria-busy={exporting}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </header>
      {toast && <div className={`panel-toast ${toast.kind}`}>{toast.message}</div>}
      {error && <p className="panel__status error">{error}</p>}
      {loading && <p className="panel__status">Loading terms…</p>}
      {!loading && filteredTerms.length === 0 && (
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
      {filteredTerms.length > 0 && (
        <table className="term-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Term</th>
              <th>Definition</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTerms.map((record) => {
              const isEditing = editingId === record.id;
              const isSaving = savingId === record.id;
              return (
                <tr key={record.id}>
                  <td>{record.id}</td>
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
    </section>
  );
}
