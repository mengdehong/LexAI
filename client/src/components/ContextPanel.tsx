import { useAppState } from "../state/AppState";

export function ContextPanel() {
  const { contexts, selectedTerm } = useAppState();

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Context Sentences</h2>
        {selectedTerm && <span className="panel__subtitle">for “{selectedTerm}”</span>}
      </header>
      <ol className="panel__list context-list">
        {contexts.length === 0 && (
          <li>
            {selectedTerm
              ? "No contexts available yet. Try refining the term or re-running extraction."
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
