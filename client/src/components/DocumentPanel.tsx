import { ChangeEvent, useCallback, useState } from "react";
import { useAppState } from "../state/AppState";

type UploadStatus = "idle" | "uploading" | "success" | "error";

async function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function DocumentPanel() {
  const { documentId, documents, setDocument, selectDocument } = useAppState();
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

      let fileText = "";
      let previewFallback = false;

      try {
        fileText = await readFileContent(file);
      } catch (previewErr) {
        previewFallback = true;
        fileText = "[Preview unavailable for this file type. Preview is limited to plain-text formats.]";
      }

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("http://127.0.0.1:8000/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || `Upload failed with status ${response.status}`);
        }

        const payload: { document_id?: string; status?: string; message?: string } =
          await response.json();

        if (!payload.document_id) {
          throw new Error("Upload succeeded but document_id missing from response");
        }

        setDocument({ id: payload.document_id, text: fileText, name: file.name });
        setUploadStatus("success");
        if (previewFallback) {
          setMessage(
            "Upload completed. Preview unavailable for this file type; use extracted terms instead.",
          );
        } else {
          setMessage(payload.message ?? "Upload completed");
        }
        event.target.value = "";
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setUploadStatus("error");
        setMessage(detail);
      }
    },
    [setDocument],
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
        <h2>Documents</h2>
        <label
          className={
            uploadStatus === "uploading" ? "upload-button upload-button--disabled" : "upload-button"
          }
        >
          <span>Select file</span>
          <input
            type="file"
            onChange={handleSelection}
            accept=".txt,.md,.pdf,.docx,.html,.rtf"
            disabled={uploadStatus === "uploading"}
          />
        </label>
      </header>
      {uploadStatus === "uploading" && <p className="panel__status">Uploading…</p>}
      {uploadStatus === "success" && message && <p className="panel__status success">{message}</p>}
      {uploadStatus === "error" && message && <p className="panel__status error">{message}</p>}
      <ul className="panel__list">
        {documents.length === 0 && <li>No documents uploaded yet.</li>}
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
