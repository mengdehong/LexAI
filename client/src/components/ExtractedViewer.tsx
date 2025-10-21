import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/state/AppState";
import { extractDocumentTerms } from "@/lib/llmClient";
import { useLocale } from "@/state/LocaleContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ExtractedViewer() {
  const { documentId, documentText, terms, setTerms, setContexts, setSelectedTerm } = useAppState();
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isDisabled = !documentId || !documentText.trim();

  const handleExtract = async () => {
    if (isDisabled) return;
    setExtracting(true);
    setError(null);
    setInfoMessage(null);
    try {
      const terms = await extractDocumentTerms(documentText);
      setTerms(terms);
      setContexts([]);
      setSelectedTerm(null);
      setInfoMessage(isChinese ? `已提取 ${terms.length} 个术语。` : `Extracted ${terms.length} terms.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      setInfoMessage(null);
    } finally {
      setExtracting(false);
    }
  };

  const highlightedHtml = useMemo(() => {
    if (!documentText.trim()) {
      const placeholder = isChinese ? "尚未选中文档。" : "No document selected.";
      return `<p class=\"reading-panel__placeholder\">${placeholder}</p>`;
    }
    let working = documentText;
    const replacements = new Map<string, { term: string; tooltip: string }>();
    const sortedTerms = [...terms].sort((a, b) => b.term.length - a.term.length);
    for (const entry of sortedTerms) {
      const baseTerm = entry.term.trim();
      if (baseTerm.length < 2) continue;
      const escaped = baseTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?!<[^>]*?)\\b(${escaped})\\b(?![^<]*?>)`, "gi");
      const token = `__TERM_${replacements.size}__`;
      if (!regex.test(working)) continue;
      const tooltipParts = [entry.definition];
      if ((entry as any).definition_cn) tooltipParts.push((entry as any).definition_cn as string);
      const tooltip = tooltipParts.filter(Boolean).join(" • ");
      replacements.set(token, { term: entry.term, tooltip });
      working = working.replace(regex, token);
    }
    replacements.forEach((value, token) => {
      const tooltipEscaped = value.tooltip.replace(/"/g, "&quot;");
      const span = `<mark class=\"term-highlight\" data-tooltip=\"${tooltipEscaped}\">${value.term}</mark>`;
      working = working.split(token).join(span);
    });
    return working.replace(/\n/g, "<br />");
  }, [documentText, terms, isChinese]);

  useEffect(() => {
    // keep scroll top when content changes visually
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [highlightedHtml]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isChinese ? "提取视图" : "Extracted View"}</CardTitle>
        <button type="button" className="pill-button" onClick={handleExtract} disabled={extracting || isDisabled} aria-busy={extracting}>
          {extracting ? (isChinese ? "正在提取…" : "Extracting…") : isChinese ? "提取术语" : "Extract Terms"}
        </button>
      </CardHeader>
      <CardContent>
        {error && <p className="panel__status error">{error}</p>}
        {infoMessage && !error && <p className="panel__status success">{infoMessage}</p>}
        {terms.length > 0 && (
          <div className="panel__list-subtitle" style={{ marginBottom: 8 }}>
            {isChinese ? `已提取术语：${terms.length} 个` : `Extracted terms: ${terms.length}`}
          </div>
        )}
        <div className="reading-panel__text" style={{ height: 560, overflow: 'auto' }} ref={scrollRef} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </CardContent>
    </Card>
  );
}
