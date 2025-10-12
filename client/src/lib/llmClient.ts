import type { TermDefinition } from "../state/AppState";
import { buildTermExtractionPrompt } from "./promptBuilder";
import type { LexAIConfig, ProviderConfig } from "./configStore";
import { loadConfig } from "./configStore";

type SupportedOperation = "termExtraction";

function normalizeBaseUrl(baseUrl: string | undefined, fallback: string): string {
  if (!baseUrl || baseUrl.trim().length === 0) {
    return fallback;
  }
  return baseUrl.replace(/\/$/, "");
}

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

function resolveApiKey(provider: ProviderConfig): string {
  if (provider.apiKey && provider.apiKey.trim().length > 0) {
    return provider.apiKey.trim();
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const candidates: string[] = [];

  if (provider.vendor === "openai") {
    candidates.push("VITE_OPENAI_API_KEY");
  }
  if (provider.vendor === "gemini") {
    candidates.push("VITE_GEMINI_API_KEY");
  }

  const normalizedId = provider.id.replace(/[^a-z0-9]/gi, "_").toUpperCase();
  if (normalizedId) {
    candidates.push(`VITE_${normalizedId}_API_KEY`);
  }

  const normalizedName = provider.name.replace(/[^a-z0-9]/gi, "_").toUpperCase();
  if (normalizedName && normalizedName !== normalizedId) {
    candidates.push(`VITE_${normalizedName}_API_KEY`);
  }

  for (const key of candidates) {
    const value = env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

async function callOpenAI(
  provider: ProviderConfig,
  model: string,
  prompt: string,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl, "https://api.openai.com/v1");
  const endpoint = `${baseUrl}/chat/completions`;
  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${provider.name}". Provide one in Settings or via environment variables.`,
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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

async function callGemini(
  provider: ProviderConfig,
  model: string,
  prompt: string,
): Promise<string> {
  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${provider.name}". Provide one in Settings or via environment variables.`,
    );
  }

  const baseUrl = normalizeBaseUrl(provider.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
  const endpoint = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
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

const OPERATION_LABELS: Record<SupportedOperation, string> = {
  termExtraction: "Document Term Extraction",
};

function ensureOperation(config: LexAIConfig, operation: SupportedOperation) {
  const mapping = config.modelMapping[operation];
  if (!mapping) {
    const label = OPERATION_LABELS[operation] ?? operation;
    throw new Error(`No model configured for ${label}. Please assign one in Settings.`);
  }

  const provider = config.providers.find((entry) => entry.id === mapping.providerId);
  if (!provider) {
    throw new Error(`Provider "${mapping.providerId}" is not defined.`);
  }

  return { provider, model: mapping.model };
}

function parseTermDefinitions(jsonString: string): TermDefinition[] {
  const parsed = JSON.parse(jsonString) as Array<{ term?: string; definition?: string }>;
  return parsed
    .map((entry) => ({
      term: String(entry.term ?? "").trim(),
      definition: String(entry.definition ?? "").trim(),
    }))
    .filter((entry) => entry.term.length > 0 && entry.definition.length > 0);
}

async function invokeTermExtraction(config: LexAIConfig, documentText: string): Promise<TermDefinition[]> {
  const { provider, model } = ensureOperation(config, "termExtraction");
  const prompt = buildTermExtractionPrompt(documentText, config.preferences.definitionLanguage);

  let jsonString: string;
  switch (provider.vendor) {
    case "openai":
      jsonString = await callOpenAI(provider, model, prompt);
      break;
    case "gemini":
      jsonString = await callGemini(provider, model, prompt);
      break;
    default:
      throw new Error(`Unsupported provider vendor: ${provider.vendor}`);
  }

  const terms = parseTermDefinitions(jsonString);
  if (terms.length === 0) {
    throw new Error("No terms returned by the language model.");
  }
  return terms;
}

export async function extractDocumentTerms(documentText: string): Promise<TermDefinition[]> {
  const config = await loadConfig();
  if (!documentText || documentText.trim().length === 0) {
    throw new Error("Document is empty.");
  }

  if (config.providers.length === 0) {
    throw new Error("No AI providers configured. Add one in Settings before extracting terms.");
  }

  return invokeTermExtraction(config, documentText);
}
