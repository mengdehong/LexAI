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
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("http://127.0.0.1:8000/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const responseClone = response.clone();
          let detailMessage = isChinese
            ? `上传失败，状态码 ${response.status}`
            : `Upload failed with status ${response.status}`;

          try {
            const errorPayload = await response.json();
            const detail = errorPayload?.detail;
            if (typeof detail === "string" && detail.trim().length > 0) {
              detailMessage = detail;
            } else if (detail && typeof detail === "object") {
              const message = typeof detail.message === "string" ? detail.message : "";
              const code = typeof detail.code === "string" ? detail.code : "";
              detailMessage = [message, code].filter(Boolean).join(" — ") || detailMessage;
            }
          } catch (jsonErr) {
            try {
              const text = await responseClone.text();
              if (text.trim().length > 0) {
                detailMessage = text;
              }
            } catch {
              console.warn("Failed to parse upload error response", jsonErr);
            }
          }

          throw new Error(detailMessage);
        }

        const payload: {
          document_id?: string;
          status?: string;
          message?: string;
          extracted_text?: string | null;
        } =
          await response.json();

        if (!payload.document_id) {
          throw new Error(
            isChinese
              ? "上传成功，但响应缺少 document_id。"
              : "Upload succeeded but document_id missing from response",
          );
        }

        let resolvedText = typeof payload.extracted_text === "string" ? payload.extracted_text : "";

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
          <li>{isChinese ? "尚未上传任何文档。" : "No documents uploaded yet."}</li>
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
