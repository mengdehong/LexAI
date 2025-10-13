import { useCallback, useMemo, useState } from "react";
import { extractDocumentTerms, explainSelection } from "../lib/llmClient";
import { useAppState } from "../state/AppState";

export function ReadingPanel() {
  const { documentId, documentText, setTerms, setContexts, setSelectedTerm } = useAppState();
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; display: string; hash: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  const isDisabled = useMemo(
    () => !documentId || documentText.trim().length === 0,
    [documentId, documentText],
  );

  const handleExtract = useCallback(async () => {
    if (isDisabled) {
      setError("Upload and select a document before extracting terms.");
      return;
    }

    setExtracting(true);
    setError(null);
    setInfoMessage(null);
    setExplainError(null);

    try {
      const terms = await extractDocumentTerms(documentText);
      setTerms(terms);
      setContexts([]);
      setSelectedTerm(null);
      setInfoMessage(`Extracted ${terms.length} terms.`);
      setSelection(null);
      setExplanation(null);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      setInfoMessage(null);
    } finally {
      setExtracting(false);
    }
  }, [documentText, isDisabled, setContexts, setSelectedTerm, setTerms]);

  const handleSelectionChange = useCallback(
    (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      if (end - start < 6) {
        setSelection(null);
        setExplanation(null);
        setExplainError(null);
        return;
      }

      const snippet = target.value.slice(start, end);
      const trimmed = snippet.trim();
      if (trimmed.length < 6) {
        setSelection(null);
        setExplanation(null);
        setExplainError(null);
        return;
      }

      const display = trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
      const hash = `${start}-${end}-${trimmed.length}`;
      setSelection((prev) => {
        if (prev && prev.hash === hash) {
          return prev;
        }
        return { text: trimmed, display, hash };
      });
      setExplanation(null);
      setExplainError(null);
    },
    [],
  );

  const handleExplain = useCallback(async () => {
    if (!selection) {
      return;
    }
    if (selection.text.length < 12) {
      setExplainError("Select a slightly longer passage (at least 12 characters).");
      return;
    }

    setExplaining(true);
    setExplainError(null);
    try {
      const result = await explainSelection(selection.text);
      setExplanation(result);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setExplainError(detail);
      setExplanation(null);
    } finally {
      setExplaining(false);
    }
  }, [selection]);

  const handleClearAssist = useCallback(() => {
    setSelection(null);
    setExplanation(null);
    setExplainError(null);
  }, []);

  return (
    <section className="panel reading-panel">
      <header className="panel__header">
        <h2>Reading View</h2>
        <button
          type="button"
          onClick={handleExtract}
          disabled={extracting || isDisabled}
          aria-busy={extracting}
        >
          {extracting ? "Extracting…" : "Extract Terms"}
        </button>
      </header>
      {error && <p className="panel__status error">{error}</p>}
      {infoMessage && !error && <p className="panel__status success">{infoMessage}</p>}
      <textarea
        readOnly
        value={documentText || "No document selected."}
        className="reading-panel__text"
        onSelect={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onMouseUp={handleSelectionChange}
      />
      {selection && (
        <div className="reading-panel__assist">
          <div className="reading-panel__assist-header">
            <h3>Selected passage</h3>
            <button type="button" className="pill-button" onClick={handleClearAssist} disabled={explaining}>
              Clear selection
            </button>
          </div>
          <p className="reading-panel__snippet">{selection.display}</p>
          <div className="reading-panel__assist-actions">
            <button
              type="button"
              className="pill-button"
              onClick={handleExplain}
              disabled={explaining}
              aria-busy={explaining}
            >
              {explaining ? "Generating explanation…" : "Explain selection"}
            </button>
          </div>
          {explainError && <p className="panel__status error">{explainError}</p>}
          {explanation && <div className="reading-panel__explanation">{explanation}</div>}
        </div>
      )}
    </section>
  );
}
