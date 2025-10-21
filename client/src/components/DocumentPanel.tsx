import { invoke } from "@tauri-apps/api/tauri";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel } from "@mantine/carousel";
import { useLocale } from "../state/LocaleContext";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function DocumentPanel() {
  const { documentId, documents, setDocument, selectDocument, removeDocument } = useAppState();
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Record<string, "queued"|"ok"|"error">>({});
  const cancelRef = useRef<boolean>(false);
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      try {
        unlisten = await listen<{
          total: number;
          completed: number;
          failed: number;
          cancelled: boolean;
          per_file: Record<string, string>;
        }>("batch://progress", (event) => {
          const p = event.payload;
          const done = p.completed + p.failed;
          setProgress(Math.round((done / Math.max(1, p.total)) * 100));
          setFileStatuses(p.per_file as Record<string, "queued" | "ok" | "error">);
          setBusy(!p.cancelled && done < p.total);
        });
      } catch {
        /* noop */
      }
    })();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);


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

    const specs: { file_path: string; file_name: string }[] = [];
    const initial: Record<string, "queued" | "ok" | "error"> = {};

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      initial[f.name] = "queued";
      const buf = await f.arrayBuffer();
      const tempPath = await invoke<string>("store_temp_document", {
        fileName: f.name,
        contents: Array.from(new Uint8Array(buf)),
      });
      specs.push({ file_path: tempPath, file_name: f.name });
    }

    setFileStatuses(initial);
    setProgress(0);

    await invoke("start_batch_upload", { files: specs });
  }, []);

  const handleSelectDocument = useCallback(
    (id: string) => {
      setMessage(null);
      selectDocument(id);
    },
    [selectDocument],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isChinese ? "文档" : "Documents"}</CardTitle>
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
      </CardHeader>
      <CardContent>
        {uploadStatus === "uploading" && (
          <p className="panel__status">{isChinese ? "正在上传…" : "Uploading…"}</p>
        )}
        {busy && (
          <>
            <p className="panel__status">{isChinese ? `正在批量上传… ${progress ?? 0}%` : `Batch uploading… ${progress ?? 0}%`}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={!busy}
                onClick={async () => {
                  cancelRef.current = true;
                  try {
                    await invoke("cancel_batch");
                  } catch {
                    /* noop */
                  }
                }}
              >
                {isChinese ? "取消批量" : "Cancel batch"}
              </button>
            </div>

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
        {documents.length === 0 ? (
          <ul className="panel__list">
            <li>
              {isChinese
                ? "尚未上传任何文档。点击上方“选择文件”或使用顶部“AI 生成术语集”快速开始。"
                : "No documents uploaded yet. Use Select file above or the top bar Generate with AI button to get started."}
            </li>
          </ul>
        ) : (
          <Carousel
            withControls={false}
            withIndicators
            slideSize={{ base: '100%', sm: '50%', md: '33.333%' }}
            slideGap="md"
            align="start"
            styles={{ indicator: { background: '#93c5fd' } }}
            aria-roledescription="carousel"
         >
            {documents.map((doc) => (
              <Carousel.Slide key={doc.id}>
                <div className={(doc.id === documentId ? "panel__list-item active" : "panel__list-item") + " doc-item"}>
                  <button
                    type="button"
                    className="doc-button"
                    onClick={() => handleSelectDocument(doc.id)}
                    aria-label={isChinese ? `打开 ${doc.name}` : `Open ${doc.name}`}
                  >
                    <div className="doc-button__meta doc-item__meta">
                      <strong>{doc.name}</strong>
                    </div>
                  </button>
                  <div className="doc-item__actions">
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm(isChinese ? "确认删除该文档？" : "Delete this document?");
                        if (ok) removeDocument(doc.id);
                      }}
                      className="pill-button negative"
                    >
                      {isChinese ? "删除" : "Delete"}
                    </button>
                  </div>
                </div>
              </Carousel.Slide>
            ))}
          </Carousel>
        )}
      </CardContent>
    </Card>
  );
}
