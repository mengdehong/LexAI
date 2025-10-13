import { useCallback, useEffect, useMemo, useState } from "react";
import { extractDocumentTerms, explainSelection } from "../lib/llmClient";
import { useAppState } from "../state/AppState";

export function ReadingPanel() {
  const { documentId, documentText, setTerms, setContexts, setSelectedTerm, globalTerms } =
    useAppState();
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; display: string; hash: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ text: string; x: number; y: number } | null>(null);

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
      setRenderedHtml("");
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

  const highlightedHtml = useMemo(() => {
    if (!documentText.trim()) {
      return "<p class=\"reading-panel__placeholder\">No document selected.</p>";
    }

    let working = documentText;
    const replacements = new Map<string, { term: string; tooltip: string }>();

    const sortedTerms = [...globalTerms].sort((a, b) => b.term.length - a.term.length);
    for (const entry of sortedTerms) {
      const baseTerm = entry.term.trim();
      if (baseTerm.length < 2) {
        continue;
      }
      const escaped = baseTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?!<[^>]*?)\\b(${escaped})\\b(?![^<]*?>)`, "gi");
      const token = `__TERM_${replacements.size}__`;
      if (!regex.test(working)) {
        continue;
      }
      const tooltipParts = [entry.definition];
      if (entry.definition_cn) {
        tooltipParts.push(entry.definition_cn);
      }
      const tooltip = tooltipParts.filter(Boolean).join(" \u2022 ");
      replacements.set(token, { term: entry.term, tooltip });
      working = working.replace(regex, token);
    }

    replacements.forEach((value, token) => {
      const tooltipEscaped = value.tooltip.replace(/"/g, "&quot;");
      const span = `<mark class=\"term-highlight\" data-tooltip=\"${tooltipEscaped}\">${value.term}</mark>`;
      working = working.split(token).join(span);
    });

    return working.replace(/\n/g, "<br />");
  }, [documentText, globalTerms]);

  useEffect(() => {
    setRenderedHtml(highlightedHtml);
  }, [highlightedHtml]);

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
        value={documentText || ""}
        className="reading-panel__text-input"
        onSelect={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onMouseUp={handleSelectionChange}
      />
      <div
        className="reading-panel__text"
        aria-label="Document preview"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
        onMouseOver={(event) => {
          const target = event.target as HTMLElement;
          if (target.matches("mark.term-highlight")) {
            const tooltip = target.getAttribute("data-tooltip") ?? "";
            const rect = target.getBoundingClientRect();
            const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            setHovered({
              text: tooltip,
              x: rect.left + rect.width / 2 - containerRect.left,
              y: rect.top - containerRect.top,
            });
          }
        }}
        onMouseOut={(event) => {
          const target = event.target as HTMLElement;
          if (target.matches("mark.term-highlight")) {
            setHovered(null);
          }
        }}
      />
      {hovered && (
        <div
          className="term-tooltip"
          style={{
            left: hovered.x,
            top: hovered.y,
          }}
        >
          {hovered.text}
        </div>
      )}
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
