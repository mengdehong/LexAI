import { invoke } from "@tauri-apps/api/tauri";
import { ChangeEvent, useCallback, useState } from "react";
import { useAppState } from "../state/AppState";
import { useLocale } from "../state/LocaleContext";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function DocumentPanel() {
  const { documentId, documents, setDocument, selectDocument } = useAppState();
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

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
          <input type="file" onChange={handleSelection} disabled={uploadStatus === "uploading"} />
        </label>
      </header>
      {uploadStatus === "uploading" && (
        <p className="panel__status">{isChinese ? "正在上传…" : "Uploading…"}</p>
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
