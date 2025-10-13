import { useAppState } from "../state/AppState";
import { useLocale } from "../state/LocaleContext";

export function ContextPanel() {
  const { contexts, selectedTerm } = useAppState();
  const language = useLocale();
  const isChinese = language === "zh-CN";

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{isChinese ? "语境句" : "Context Sentences"}</h2>
        {selectedTerm && (
          <span className="panel__subtitle">
            {isChinese ? `针对 “${selectedTerm}”` : `for “${selectedTerm}”`}
          </span>
        )}
      </header>
      <ol className="panel__list context-list">
        {contexts.length === 0 && (
          <li>
            {selectedTerm
              ? isChinese
                ? "目前没有找到相关语境，可尝试优化术语或重新提取。"
                : "No contexts available yet. Try refining the term or re-running extraction."
              : isChinese
              ? "从列表中选择一个术语即可查看匹配的语境句。"
              : "Select a term from the list to view matching contexts."}
          </li>
        )}
        {contexts.map((sentence, index) => (
          <li key={`${index}-${sentence.slice(0, 16)}`}>{sentence}</li>
        ))}
      </ol>
    </section>
  );
}
