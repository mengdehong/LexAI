import type { TermDefinition } from "../state/AppState";
import {
  buildExplanationPrompt,
  buildTermExpansionPrompt,
  buildOnboardingPrompt,
  buildTermExtractionPrompt,
  type OnboardingProfile,
  type TermExpansionContext,
} from "./promptBuilder";
import type { DefinitionLanguage, LexAIConfig, ProviderConfig } from "./configStore";
import { loadConfig } from "./configStore";
import { getApiKey } from "./apiKeys";
import { dedupeTermDefinitions } from "./termUtils";

type SupportedOperation = "termExtraction" | "onboarding" | "explanation" | "deepDive";

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
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }
  return trimmed;
}

async function resolveApiKey(provider: ProviderConfig): Promise<string> {
  try {
    const stored = await getApiKey(provider.id);
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.error(`Failed to load API key for provider ${provider.id}`, error);
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

export async function testProvider(provider: ProviderConfig, keyOverride?: string): Promise<void> {
  // Never print or return the API key.
  const vendor = provider.vendor;
  const baseUrl = normalizeBaseUrl(
    provider.baseUrl,
    vendor === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.openai.com/v1",
  );

  let apiKey = (keyOverride ?? "").trim();
  if (!apiKey) {
    apiKey = await resolveApiKey(provider);
  }
  if (!apiKey) {
    const hint = `Missing API key for provider "${provider.name}" (id: ${provider.id}). Open Settings and set the key, or define VITE_${provider.id
      .replace(/[^a-z0-9]/gi, "_")
      .toUpperCase()}_API_KEY.`;
    throw new Error(hint);
  }

  if (vendor === "gemini") {
    const resp = await fetch(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}`);
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(detail || `Gemini API connection failed (HTTP ${resp.status}).`);
    }
    return;
  }

  // Default to OpenAI-compatible
  const resp = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(detail || `OpenAI-compatible API connection failed (HTTP ${resp.status}).`);
  }
}

async function callOpenAI(
  provider: ProviderConfig,
  model: string,
  systemPrompt: string,
  prompt: string,
  expectJson = true,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl, "https://api.openai.com/v1");
  const endpoint = `${baseUrl}/chat/completions`;
  const apiKey = await resolveApiKey(provider);
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
          content: systemPrompt,
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

  return expectJson ? extractJsonPayload(content) : content.trim();
}

async function callGemini(
  provider: ProviderConfig,
  model: string,
  systemPrompt: string,
  prompt: string,
  expectJson = true,
): Promise<string> {
  const apiKey = await resolveApiKey(provider);
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
          parts: [
            { text: systemPrompt },
            { text: prompt },
          ],
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

  return expectJson ? extractJsonPayload(text) : text.trim();
}

const OPERATION_LABELS: Record<SupportedOperation, string> = {
  termExtraction: "Document Term Extraction",
  onboarding: "Conversational Onboarding",
  explanation: "AI Assisted Definitions",
  deepDive: "Term Deep Dive",
};

function buildSystemPrompt(operation: SupportedOperation, language: DefinitionLanguage): string {
  const languageNote =
    language === "zh-CN"
      ? "Return definitions in Simplified Chinese unless otherwise specified."
      : "Return definitions in English unless otherwise specified.";

  switch (operation) {
    case "onboarding":
      return `You are LexAI's onboarding mentor. Use the provided learner context to curate a starter glossary tailored to their needs. Always respond with a minified JSON array. ${languageNote}`;
    case "explanation":
      return `You are a domain tutor helping learners understand complex passages. Provide short, high-impact explanations with optional examples. ${languageNote}`;
    case "deepDive":
      return `You are an AI language tutor who expands a learner's understanding of a term through contextual knowledge, associations, and rich examples. Always return strictly valid JSON following the requested schema. ${languageNote}`;
    case "termExtraction":
    default:
      return `You are a multilingual terminology extraction assistant for LexAI. Respond only with minified JSON arrays of objects with 'term' and 'definition' keys. ${languageNote}`;
  }
}

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
  const parsed = JSON.parse(jsonString) as Array<
    { term?: string; definition?: string; definition_cn?: string; definitionCn?: string }
  >;
  return parsed
    .map((entry) => ({
      term: String(entry.term ?? "").trim(),
      definition: String(entry.definition ?? "").trim(),
      definition_cn: (entry.definition_cn ?? entry.definitionCn ?? "").trim() || undefined,
    }))
    .filter((entry) => entry.term.length > 0 && entry.definition.length > 0);
}

type TermExpansionResult = {
  example_sentences: string[];
  usage_scenario: string;
  related_terms: Array<{ term: string; relationship: string }>;
};

function parseExpansionResult(jsonString: string): TermExpansionResult {
  const parsed = JSON.parse(jsonString) as Partial<TermExpansionResult>;

  const exampleSentences = Array.isArray(parsed.example_sentences)
    ? parsed.example_sentences
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    : [];

  const usageScenario = typeof parsed.usage_scenario === "string" ? parsed.usage_scenario.trim() : "";

  const relatedTerms = Array.isArray(parsed.related_terms)
    ? parsed.related_terms
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const term = typeof entry.term === "string" ? entry.term.trim() : "";
          const relationship = typeof entry.relationship === "string" ? entry.relationship.trim() : "";
          if (!term || !relationship) {
            return null;
          }
          return { term, relationship };
        })
        .filter((entry): entry is { term: string; relationship: string } => entry !== null)
    : [];

  if (exampleSentences.length === 0 || !usageScenario || relatedTerms.length === 0) {
    throw new Error("The language model returned incomplete expansion data.");
  }

  return {
    example_sentences: exampleSentences.slice(0, 5),
    usage_scenario: usageScenario,
    related_terms: relatedTerms.slice(0, 6),
  };
}

async function runRawOperation(
  config: LexAIConfig,
  operation: SupportedOperation,
  prompt: string,
  expectJson: boolean,
): Promise<string> {
  const { provider, model } = ensureOperation(config, operation);
  const systemPrompt = buildSystemPrompt(operation, config.preferences.definitionLanguage);

  let response: string;
  switch (provider.vendor) {
    case "openai":
      response = await callOpenAI(provider, model, systemPrompt, prompt, expectJson);
      break;
    case "gemini":
      response = await callGemini(provider, model, systemPrompt, prompt, expectJson);
      break;
    default:
      throw new Error(`Unsupported provider vendor: ${provider.vendor}`);
  }

  const trimmed = response.trim();
  if (!trimmed) {
    throw new Error("The language model returned an empty response.");
  }
  return trimmed;
}

async function runTermOperation(
  config: LexAIConfig,
  operation: SupportedOperation,
  prompt: string,
): Promise<TermDefinition[]> {
  const jsonString = await runRawOperation(config, operation, prompt, true);
  const terms = parseTermDefinitions(jsonString);
  const deduped = dedupeTermDefinitions(terms);
  if (deduped.length === 0) {
    throw new Error("No terms returned by the language model.");
  }
  return deduped;
}

async function runTextOperation(
  config: LexAIConfig,
  operation: SupportedOperation,
  prompt: string,
): Promise<string> {
  return runRawOperation(config, operation, prompt, false);
}

export async function extractDocumentTerms(documentText: string): Promise<TermDefinition[]> {
  const config = await loadConfig();
  if (!documentText || documentText.trim().length === 0) {
    throw new Error("Document is empty.");
  }

  if (config.providers.length === 0) {
    throw new Error("No AI providers configured. Add one in Settings before extracting terms.");
  }

  const prompt = buildTermExtractionPrompt(documentText, config.preferences.definitionLanguage);
  return runTermOperation(config, "termExtraction", prompt);
}

export async function generateOnboardingTerms(profile: OnboardingProfile): Promise<TermDefinition[]> {
  const config = await loadConfig();
  if (config.providers.length === 0) {
    throw new Error("No AI providers configured. Add one in Settings before running onboarding.");
  }

  const prompt = buildOnboardingPrompt(profile, config.preferences.definitionLanguage);
  return runTermOperation(config, "onboarding", prompt);
}

export async function explainSelection(snippet: string): Promise<string> {
  const config = await loadConfig();
  const trimmed = snippet.trim();
  if (!trimmed) {
    throw new Error("Select some text first.");
  }

  if (config.providers.length === 0) {
    throw new Error("No AI providers configured. Add one in Settings before requesting explanations.");
  }

  const prompt = buildExplanationPrompt(trimmed, config.preferences.definitionLanguage);
  return runTextOperation(config, "explanation", prompt);
}

export type { TermExpansionResult };

export async function expandTerm(context: TermExpansionContext): Promise<TermExpansionResult> {
  const config = await loadConfig();
  if (config.providers.length === 0) {
    throw new Error("No AI providers configured. Add one in Settings before expanding terminology.");
  }

  const prompt = buildTermExpansionPrompt(context, config.preferences.definitionLanguage);
  const jsonString = await runRawOperation(config, "deepDive", prompt, true);
  return parseExpansionResult(jsonString);
}
