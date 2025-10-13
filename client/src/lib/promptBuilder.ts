import type { DefinitionLanguage } from "./configStore";

export type OnboardingProfile = {
  domain: string;
  proficiency: "beginner" | "intermediate" | "advanced";
  goals: string;
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

  return `You are LexAI's onboarding mentor. Craft a personalised starter glossary for a new learner.
Learner profile:
- Domain expertise: ${domain}
- English proficiency: ${proficiency}
- Learning goals: ${goals}

${instruction}
Requirements:
1. Return 12 essential terms that accelerate the learner's progress in the stated domain.
2. Provide concise, context-aware definitions that the learner can apply immediately.
3. Only answer with a minified JSON array of objects shaped as {"term": "...", "definition": "..."}.
4. Avoid commentary, markdown, or explanations outside of the JSON array.`;
}
