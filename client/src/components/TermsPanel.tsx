import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { TermDefinition, useAppState } from "../state/AppState";

export function TermsPanel() {
  const { documentId, terms, selectedTerm, setSelectedTerm, setContexts } = useAppState();
  const [loadingTerm, setLoadingTerm] = useState<string | null>(null);
  const [savingTerm, setSavingTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    setInfoMessage(null);
  }, [terms]);

  const fetchContexts = useCallback(
    async (term: string) => {
      if (!documentId) {
        setError("Upload a document before requesting contexts.");
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
    [documentId, setContexts, setSelectedTerm],
  );

  const saveTerm = useCallback(
    async (entry: TermDefinition) => {
      setSavingTerm(entry.term);
      setError(null);
      setInfoMessage(null);
      try {
        await invoke("add_term", {
          term: entry.term,
          definition: entry.definition,
        });
        setInfoMessage(`Saved term \"${entry.term}\" to global database.`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingTerm(null);
      }
    },
    [],
  );

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Extracted Terms</h2>
      </header>
      {error && <p className="panel__status error">{error}</p>}
      {infoMessage && <p className="panel__status success">{infoMessage}</p>}
      {loadingTerm && !error && (
        <p className="panel__status">Searching contexts for “{loadingTerm}”…</p>
      )}
      <ul className="panel__list terms-list">
        {terms.length === 0 && <li>No terms extracted yet.</li>}
        {terms.map((entry) => {
          const isActive = entry.term === selectedTerm;
          const isLoading = loadingTerm === entry.term;
          const isSaving = savingTerm === entry.term;
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
              >
                <span className="term-button__term">{entry.term}</span>
                <span className="term-button__definition">{entry.definition}</span>
              </button>
              <button
                type="button"
                className="save-button"
                onClick={() => saveTerm(entry)}
                disabled={isSaving}
                aria-label={`Save ${entry.term}`}
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
