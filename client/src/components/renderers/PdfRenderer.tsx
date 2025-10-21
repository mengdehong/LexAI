import { useEffect, useRef, useState } from "react";

type PdfRendererProps = { sourceBytes: Uint8Array };

export function PdfRenderer({ sourceBytes }: PdfRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bytes = sourceBytes;
        const pdfjs: any = await import("pdfjs-dist");
        const loadingTask = pdfjs.getDocument({ data: bytes, disableWorker: true });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPages(doc.numPages);
        const pg = await doc.getPage(page);
        const viewport = pg.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await pg.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceBytes, page, scale]);

  return (
    <div style={{ height: 560, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button type="button" className="pill-button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          ◀
        </button>
        <span style={{ fontSize: 12 }}>{page} / {pages}</span>
        <button type="button" className="pill-button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
          ▶
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="pill-button" onClick={() => setScale((s) => Math.max(0.5, parseFloat((s - 0.1).toFixed(2))))}>-</button>
          <span style={{ fontSize: 12 }}>{Math.round(scale * 100)}%</span>
          <button type="button" className="pill-button" onClick={() => setScale((s) => Math.min(3, parseFloat((s + 0.1).toFixed(2))))}>+</button>
        </div>
      </div>
      {error ? (
        <p className="panel__status error">{error}</p>
      ) : (
        <div style={{ flex: 1, overflow: "auto" }}>
          <canvas ref={canvasRef} />
        </div>
      )}
    </div>
  );
}
