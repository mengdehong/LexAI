import { useCallback, useMemo, useState } from "react";
import { useAppState } from "../state/AppState";

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

async function callOpenAI(prompt: string, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a terminology extraction assistant. Respond only with minified JSON arrays of objects with 'term' and 'definition' keys.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `OpenAI request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing content");
  }

  return extractJsonPayload(content);
}

async function callGemini(prompt: string, apiKey: string) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Gemini request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((part: { text?: string }) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n")
        .trim()
    : undefined;

  if (!text) {
    throw new Error("Gemini response missing content");
  }

  return extractJsonPayload(text);
}

export function ReadingPanel() {
  const { documentId, documentText, setTerms, setContexts, setSelectedTerm } = useAppState();
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const isDisabled = useMemo(() => !documentId || documentText.trim().length === 0, [documentId, documentText]);

  const handleExtract = useCallback(async () => {
    if (isDisabled) {
      setError("Upload and select a document before extracting terms.");
      return;
    }

    const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!openaiKey && !geminiKey) {
      setError(
        "Missing API key. Provide VITE_OPENAI_API_KEY or VITE_GEMINI_API_KEY in your environment.",
      );
      return;
    }

    setExtracting(true);
    setError(null);
     setInfoMessage(null);

    try {
      const prompt = `Extract key terminology from the following document. Respond with a JSON array where each entry has \\"term\\" and \\"definition\\" keys. Focus on critical domain terms. Document:\n\n${documentText}`;
      const jsonString = openaiKey
        ? await callOpenAI(prompt, openaiKey)
        : await callGemini(prompt, geminiKey!);

      const parsed = JSON.parse(jsonString) as Array<{ term?: string; definition?: string }>;
      const cleaned = parsed
        .map((entry) => ({
          term: String(entry.term ?? "").trim(),
          definition: String(entry.definition ?? "").trim(),
        }))
        .filter((entry) => entry.term.length > 0 && entry.definition.length > 0);

      if (cleaned.length === 0) {
        throw new Error("No terms returned by OpenAI.");
      }

      setTerms(cleaned);
      setContexts([]);
      setSelectedTerm(null);
      setInfoMessage(`Extracted ${cleaned.length} terms.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      setInfoMessage(null);
    } finally {
      setExtracting(false);
    }
  }, [documentText, isDisabled, setContexts, setSelectedTerm, setTerms]);

  return (
    <section className="panel reading-panel">
      <header className="panel__header">
        <h2>Reading View</h2>
        <button
          type="button"
          onClick={handleExtract}
          disabled={extracting || isDisabled}
          aria-busy={extracting}
        >
          {extracting ? "Extracting…" : "Extract Terms"}
        </button>
      </header>
      {error && <p className="panel__status error">{error}</p>}
      {infoMessage && !error && <p className="panel__status success">{infoMessage}</p>}
      <textarea
        readOnly
        value={documentText || "No document selected."}
        className="reading-panel__text"
      />
    </section>
  );
}
