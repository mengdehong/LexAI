import type { DefinitionLanguage } from "./configStore";

export type OnboardingProfile = {
  domain: string;
  proficiency: "beginner" | "intermediate" | "advanced";
  goals: string;
};

export type TermExpansionContext = {
  term: string;
  definition: string;
  definitionCn?: string | null;
  domain?: string;
};

const LANGUAGE_INSTRUCTIONS: Record<DefinitionLanguage, string> = {
  en: "Provide each definition in English.",
  "zh-CN": "请使用简体中文撰写每个术语的释义。",
};

const PROFICIENCY_GUIDANCE: Record<OnboardingProfile["proficiency"], string> = {
  beginner: "The learner is just getting started. Prefer approachable explanations and include foundational concepts.",
  intermediate:
    "The learner has moderate command of English terminology. Balance core vocabulary with domain-specific expressions.",
  advanced:
    "The learner reads complex materials comfortably. Focus on high-impact, nuanced terminology that enhances precision.",
};

export function buildTermExtractionPrompt(text: string, language: DefinitionLanguage): string {
  const instruction = LANGUAGE_INSTRUCTIONS[language] ?? LANGUAGE_INSTRUCTIONS.en;
  return `Analyze the following document and extract the most important terminology. ${instruction} Respond with a JSON array of objects in the shape {"term": "...", "definition": "..."}. Only return JSON.
---
Document:
${text}`;
}

export function buildOnboardingPrompt(profile: OnboardingProfile, language: DefinitionLanguage): string {
  const instruction = LANGUAGE_INSTRUCTIONS[language] ?? LANGUAGE_INSTRUCTIONS.en;
  const proficiency =
    PROFICIENCY_GUIDANCE[profile.proficiency] ?? PROFICIENCY_GUIDANCE.intermediate;
  const domain = profile.domain.trim() || "General";
  const goals = profile.goals.trim() || "Build a personalised glossary.";

  return `You are LexAI's onboarding mentor. Craft a comprehensive starter glossary for a new learner.
Learner profile:
- Domain expertise: ${domain}
- English proficiency: ${proficiency}
- Learning goals: ${goals}

${instruction}
Requirements:
1. Return between 60 and 80 high-impact terms grouped into three categories: "Foundational Core", "Applied Practice", and "Advanced Frontier".
2. Provide concise, context-aware definitions (40-80 words) that the learner can apply immediately.
3. Respond with a minified JSON array; each object must include "term", "definition", and "category" (the category names above).
4. Preserve the learner's domain language and avoid duplicates.
5. Do not include commentary, markdown, or any text outside the JSON array.`;
}

export function buildExplanationPrompt(snippet: string, language: DefinitionLanguage): string {
  const instruction =
    language === "zh-CN"
      ? "请使用简体中文给出释义，并在需要时补充关键背景或例子，最多 120 字。"
      : "Answer in clear English, optionally including a concise example. Limit to 2-3 sentences.";

  const trimmed = snippet.trim();
  const truncated = trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…` : trimmed;

  return `Provide a precise, pedagogical explanation for the highlighted passage. ${instruction}
Focus on what the learner must know to understand or apply it correctly.

Passage:
"""
${truncated}
"""`;
}

export function buildTermExpansionPrompt(
  payload: TermExpansionContext,
  language: DefinitionLanguage,
): string {
  const { term, definition, definitionCn, domain } = payload;
  const focusDomain = domain?.trim().length ? domain.trim() : "general professional communication";
  const languageDirection =
    language === "zh-CN"
      ? "Use Simplified Chinese for all generated content unless the term itself requires English."
      : "Respond in English unless the term itself must remain in another language.";

  const supplemental = definitionCn?.trim().length
    ? `Existing bilingual definitions:
- English: ${definition}
- Chinese: ${definitionCn}`
    : `Existing definition:
- ${definition}`;

  return `You are an AI language tutor specializing in the field of ${focusDomain}. A user is studying the technical term "${term}".
${supplemental}

To help the user deeply understand this term, generate the following content in a structured JSON format:
{
  "example_sentences": [
    "Provide 3 clear and authentic example sentences using the term in a professional context.",
    "...",
    "..."
  ],
  "usage_scenario": "Describe a typical real-world scenario or problem where this term would be commonly used. Explain it in a simple, easy-to-understand way.",
  "related_terms": [
    { "term": "Related Term 1", "relationship": "Explain briefly how it's related (e.g., 'is a type of', 'is the opposite of', 'often used with')." },
    { "term": "Related Term 2", "relationship": "..." }
  ]
}

${languageDirection}
Ensure your response is strictly valid JSON with double-quoted keys and strings. Do not include trailing commas, Markdown, or commentary.`;
}
