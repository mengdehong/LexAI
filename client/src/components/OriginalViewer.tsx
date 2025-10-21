import { useMemo } from "react";
import { useAppState } from "@/state/AppState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PdfRenderer } from "./renderers/PdfRenderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function OriginalViewer() {
  const { documentId, documents, documentText } = useAppState();
  const doc = useMemo(() => documents.find((d) => d.id === documentId) || null, [documents, documentId]);

  const mode: "markdown" | "pdf" | "text" | "none" = useMemo(() => {
    if (!doc) return "none";
    const mt = doc.mimeType || "";
    if (mt.includes("pdf") || doc.name.toLowerCase().endsWith(".pdf")) return "pdf";
    if (mt.includes("markdown") || doc.name.toLowerCase().endsWith(".md")) return "markdown";
    return "text";
  }, [doc]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{doc ? doc.name : "Original"}</CardTitle>
      </CardHeader>
      <CardContent>
        {!doc ? (
          <p className="panel__status">No document selected.</p>
        ) : mode === "markdown" ? (
          <div style={{ height: 560, overflow: "auto" }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{documentText}</ReactMarkdown>
          </div>
        ) : mode === "pdf" && doc.sourcePath ? (
          <div style={{ height: 560, overflow: "hidden" }}>
            <PdfRenderer sourcePath={doc.sourcePath} />
          </div>
        ) : (
          <pre style={{ height: 560, overflow: "auto", whiteSpace: "pre-wrap" }}>{documentText}</pre>
        )}
      </CardContent>
    </Card>
  );
}
