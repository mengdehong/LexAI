import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type BackendStatusPayload = {
  status: string;
};

function App() {
  const [status, setStatus] = useState<string>("Connecting...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchStatus = async () => {
      try {
        const raw = (await invoke<string>("fetch_backend_status")) ?? "";
        const payload: BackendStatusPayload = JSON.parse(raw);

        if (active) {
          setStatus(payload.status ?? "unknown");
          setError(null);
        }
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setStatus("unavailable");
        }
      }
    };

    fetchStatus();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="container">
      <h1>LexAI Desktop Shell</h1>
      <p>Backend status: {status}</p>
      {error && <p className="error">Last error: {error}</p>}
      <p className="hint">
        Launch the FastAPI server with
        <code> poetry run uvicorn app.main:app --reload </code>
        to see a successful status response.
      </p>
    </main>
  );
}

export default App;
