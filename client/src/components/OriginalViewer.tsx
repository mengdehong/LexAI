import { useMemo } from "react";
import { useAppState } from "@/state/AppState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function OriginalViewer() {
  const { documentId, documents, documentText } = useAppState();
  const doc = useMemo(() => documents.find((d) => d.id === documentId) || null, [documents, documentId]);

  const mode: "markdown" | "text" | "none" = useMemo(() => {
    if (!doc) return "none";
    const mt = doc.mimeType || "";
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
          <div style={{ maxHeight: 560, overflow: "auto" }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{documentText}</ReactMarkdown>
          </div>
        ) : (
          <pre style={{ maxHeight: 560, overflow: "auto", whiteSpace: "pre-wrap" }}>{documentText}</pre>
        )}
      </CardContent>
    </Card>
  );
}
