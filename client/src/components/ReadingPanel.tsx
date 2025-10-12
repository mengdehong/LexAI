import { useCallback, useMemo, useState } from "react";
import { extractDocumentTerms } from "../lib/llmClient";
import { useAppState } from "../state/AppState";

export function ReadingPanel() {
  const { documentId, documentText, setTerms, setContexts, setSelectedTerm } = useAppState();
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

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

    try {
      const terms = await extractDocumentTerms(documentText);
      setTerms(terms);
      setContexts([]);
      setSelectedTerm(null);
      setInfoMessage(`Extracted ${terms.length} terms.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      setInfoMessage(null);
    } finally {
      setExtracting(false);
    }
  }, [documentText, isDisabled, setContexts, setSelectedTerm, setTerms]);

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
      />
    </section>
  );
}
