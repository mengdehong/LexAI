import { invoke } from "@tauri-apps/api/tauri";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppState";
import { useLocale } from "../state/LocaleContext";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function DocumentPanel() {
  const { documentId, documents, setDocument, selectDocument } = useAppState();
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Record<string, "queued"|"ok"|"error">>({});
  const cancelRef = useRef<boolean>(false);

  useEffect(() => () => { cancelRef.current = true; }, []);

  const handleSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      setUploadStatus("uploading");
      setMessage(null);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const tempPath = await invoke<string>("store_temp_document", {
          fileName: file.name,
          contents: Array.from(new Uint8Array(arrayBuffer)),
        });

        const payload = await invoke<{
          document_id: string;
          extracted_text?: string | null;
          message?: string | null;
          status: string;
        }>("upload_document", {
          filePath: tempPath,
          fileName: file.name,
        });

        if (!payload.document_id || !payload.status || payload.status.toLowerCase() !== "processed") {
          throw new Error(
            isChinese ? "上传失败，请稍后重试。" : "Upload failed. Please try again.",
          );
        }

        let resolvedText = payload.extracted_text ?? "";

        if (!resolvedText.trim()) {
          resolvedText = isChinese
            ? "[未获取到文档正文，解析结果为空。]"
            : "[Document text unavailable. Extraction returned empty result.]";
        }

        setDocument({ id: payload.document_id, text: resolvedText, name: file.name });
        setUploadStatus("success");
        setMessage(
          payload.message ?? (isChinese ? "上传完成" : "Upload completed"),
        );
        if (
          resolvedText.startsWith("[Document text unavailable.") ||
          resolvedText.startsWith("[未获取到文档正文")
        ) {
          setMessage(
            isChinese
              ? "上传完成，但文档无法解析预览。可尝试重新上传其他文件。"
              : "Upload completed, but the document could not be parsed for preview. You can still retry with another file.",
          );
        }
        event.target.value = "";
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setUploadStatus("error");
        setMessage(detail);
      }
    },
    [isChinese, setDocument],
  );

  const handleMultiple = useCallback(async (files: FileList) => {
    setBusy(true);
    setMessage(null);
    cancelRef.current = false;
    const total = files.length;
    const initial: Record<string, "queued"|"ok"|"error"> = {};
    for (let i = 0; i < total; i++) {
      const f = files[i]!;
      initial[f.name] = "queued";
    }
    setFileStatuses(initial);
    setProgress(0);

    for (let i = 0; i < total; i++) {
      if (cancelRef.current) break;
      const f = files[i]!;
      try {
        const arrayBuffer = await f.arrayBuffer();
        const tempPath = await invoke<string>("store_temp_document", {
          fileName: f.name,
          contents: Array.from(new Uint8Array(arrayBuffer)),
        });
        const payload = await invoke<{
          document_id: string;
          extracted_text?: string | null;
          message?: string | null;
          status: string;
        }>("upload_document", { filePath: tempPath, fileName: f.name });
        if (payload?.document_id) {
          setFileStatuses((prev) => ({ ...prev, [f.name]: "ok" }));
          if (i === total - 1) {
            setDocument({ id: payload.document_id, text: payload.extracted_text ?? "", name: f.name });
          }
        } else {
          setFileStatuses((prev) => ({ ...prev, [f.name]: "error" }));
        }
      } catch (err) {
        setFileStatuses((prev) => ({ ...prev, [f.name]: "error" }));
        console.error("Failed to upload", f.name, err);
      }
      setProgress(Math.round(((i + 1) / total) * 100));
    }
    setBusy(false);
  }, [setDocument]);

  const handleSelectDocument = useCallback(
    (id: string) => {
      setMessage(null);
      selectDocument(id);
    },
    [selectDocument],
  );

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{isChinese ? "文档" : "Documents"}</h2>
        <label
          className={
            uploadStatus === "uploading" ? "upload-button upload-button--disabled" : "upload-button"
          }
        >
          <span>{isChinese ? "选择文件" : "Select file"}</span>
          <input
            type="file"
            multiple
            onChange={async (e) => {
              const list = e.target.files;
              if (!list || list.length === 0) return;
              if (list.length === 1) {
                await handleSelection(e as unknown as ChangeEvent<HTMLInputElement>);
              } else {
                setMessage(null);
                await handleMultiple(list);
              }
              e.currentTarget.value = "";
            }}
            disabled={uploadStatus === "uploading" || busy}
          />
        </label>
      </header>
      {uploadStatus === "uploading" && (
        <p className="panel__status">{isChinese ? "正在上传…" : "Uploading…"}</p>
      )}
      {busy && (
        <>
          <p className="panel__status">{isChinese ? `正在批量上传… ${progress ?? 0}%` : `Batch uploading… ${progress ?? 0}%`}</p>
        {busy && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={!busy} onClick={() => { cancelRef.current = true; }}>
              {isChinese ? "取消批量" : "Cancel batch"}
            </button>
          </div>
        )}

          <ul className="panel__list">
            <li>
              <strong>{isChinese ? "批量明细" : "Batch details"}</strong>
              <div className="panel__list-subtitle">
                {Object.keys(fileStatuses).length === 0 ? (isChinese ? "准备中…" : "Preparing…") : (
                  <ul>
                    {Object.entries(fileStatuses).map(([name, st]) => (
                      <li key={name}>{name} — {st}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          </ul>
        </>
      )}
      {uploadStatus === "success" && message && <p className="panel__status success">{message}</p>}
      {uploadStatus === "error" && message && <p className="panel__status error">{message}</p>}
      <ul className="panel__list">
        {documents.length === 0 && (
          <li>
            {isChinese
              ? "尚未上传任何文档。点击上方“选择文件”或使用顶部“AI 生成术语集”快速开始。"
              : "No documents uploaded yet. Use Select file above or the top bar Generate with AI button to get started."}
          </li>
        )}
        {documents.map((doc) => (
          <li key={doc.id} className={doc.id === documentId ? "panel__list-item active" : "panel__list-item"}>
            <button
              type="button"
              className="doc-button"
              onClick={() => handleSelectDocument(doc.id)}
            >
              <div className="doc-button__meta">
                <strong>{doc.name}</strong>
                <span className="panel__list-subtitle">{doc.id}</span>
              </div>
              <time dateTime={new Date(doc.uploadedAt).toISOString()}>
                {new Date(doc.uploadedAt).toLocaleTimeString()}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
