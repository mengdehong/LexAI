import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

type StoredTerm = {
  id: number;
  term: string;
  definition: string;
};

export function GlobalTermbaseView() {
  const [terms, setTerms] = useState<StoredTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await invoke<StoredTerm[]>("get_all_terms");
      setTerms(payload);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteTerm = useCallback(
    async (id: number) => {
      try {
        await invoke("delete_term", { id });
        setTerms((prev) => prev.filter((term) => term.id !== id));
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      }
    },
    [],
  );

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  return (
    <section className="panel global-view">
      <header className="panel__header">
        <h2>Global Termbase</h2>
        <button type="button" onClick={loadTerms} disabled={loading}>
          Refresh
        </button>
      </header>
      {loading && <p className="panel__status">Loading terms…</p>}
      {error && <p className="panel__status error">{error}</p>}
      <table className="term-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Term</th>
            <th>Definition</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {terms.length === 0 && !loading && (
            <tr>
              <td colSpan={4}>No terms saved yet.</td>
            </tr>
          )}
          {terms.map((record) => (
            <tr key={record.id}>
              <td>{record.id}</td>
              <td>{record.term}</td>
              <td>{record.definition}</td>
              <td>
                <button type="button" onClick={() => deleteTerm(record.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
