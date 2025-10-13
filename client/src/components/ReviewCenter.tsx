import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useLocale } from "../state/LocaleContext";

type StoredTerm = {
  id: number;
  term: string;
  definition: string;
  definition_cn: string | null;
  review_stage: number;
  last_reviewed_at: string | null;
};

const REVIEW_BATCH_SIZE = 20;

type ReviewCenterProps = {
  onReviewCountChange?: (count: number) => void;
};

export function ReviewCenter({ onReviewCountChange }: ReviewCenterProps) {
  const language = useLocale();
  const isChinese = language === "zh-CN";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<StoredTerm[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const announcement = useMemo(() => {
    if (loading) {
      return isChinese ? "正在准备复习列表…" : "Preparing review queue…";
    }
    if (error) {
      return error;
    }
    if (terms.length === 0) {
      return isChinese ? "今天暂时没有需要复习的术语。" : "Nothing to review right now.";
    }
    return null;
  }, [error, isChinese, loading, terms.length]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSubmitting(false);
    setRevealed(false);
    try {
      const payload = await invoke<StoredTerm[]>("get_review_terms", { limit: REVIEW_BATCH_SIZE });
      setTerms(payload);
      setActiveIndex(0);
      if (payload.length === 0) {
        setError(isChinese ? "今天暂时没有需要复习的术语。" : "Nothing to review right now.");
      }
      onReviewCountChange?.(payload.length);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      setTerms([]);
      onReviewCountChange?.(0);
    } finally {
      setLoading(false);
      setRevealed(false);
    }
  }, [isChinese, onReviewCountChange]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const current = terms[activeIndex] ?? null;

  const handleShowAnswer = () => {
    setRevealed(true);
  };

  const handleReviewAction = async (known: boolean) => {
    if (!current) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await invoke("submit_review_result", { id: current.id, known });
      await loadQueue();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
    } finally {
      setSubmitting(false);
      setRevealed(false);
    }
  };

  const handleRefresh = () => {
    loadQueue();
  };

  return (
    <section className="panel global-view">
      <header className="panel__header">
        <div>
          <h2>{isChinese ? "复习中心" : "Review Center"}</h2>
          <p className="panel__subtitle">
            {isChinese
              ? "使用简易间隔复习，让术语记忆更牢固。"
              : "A lightweight spaced-repetition loop for your terminology."}
          </p>
        </div>
        <button type="button" className="pill-button" onClick={handleRefresh} disabled={loading}>
          {loading
            ? isChinese
              ? "正在刷新…"
              : "Refreshing…"
            : isChinese
            ? "刷新队列"
            : "Refresh queue"}
        </button>
      </header>
      {announcement && <p className={`panel__status${error ? " error" : ""}`}>{announcement}</p>}
      {!announcement && current && (
        <div className="review-mode">
          <div className="review-card">
            <div className="review-card__meta">
              <span className="review-card__stage">
                {isChinese ? `阶段 ${current.review_stage}` : `Stage ${current.review_stage}`}
              </span>
              {current.last_reviewed_at && (
                <span className="review-card__timestamp">
                  {isChinese ? "上次复习：" : "Last reviewed: "}
                  {new Date(current.last_reviewed_at).toLocaleString()}
                </span>
              )}
            </div>
            <div className="review-card__term">{current.term}</div>
            {revealed ? (
              <div className="review-card__definition-group">
                <div className="review-card__definition">{current.definition}</div>
                {current.definition_cn && (
                  <div className="review-card__definition review-card__definition--cn">
                    {current.definition_cn}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="pill-button review-card__show"
                onClick={handleShowAnswer}
                disabled={submitting}
              >
                {isChinese ? "显示答案" : "Show answer"}
              </button>
            )}
            <div className="review-card__actions">
              <button
                type="button"
                className="pill-button negative"
                onClick={() => handleReviewAction(false)}
                disabled={submitting}
              >
                {submitting
                  ? isChinese
                    ? "正在更新…"
                    : "Updating…"
                  : isChinese
                  ? "不认识"
                  : "Don't know"}
              </button>
              <button
                type="button"
                className="pill-button positive"
                onClick={() => handleReviewAction(true)}
                disabled={submitting || !revealed}
              >
                {submitting
                  ? isChinese
                    ? "正在更新…"
                    : "Updating…"
                  : isChinese
                  ? "认识"
                  : "I know this"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
