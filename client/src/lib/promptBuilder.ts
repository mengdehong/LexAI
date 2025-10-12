import type { DefinitionLanguage } from "./configStore";

const LANGUAGE_INSTRUCTIONS: Record<DefinitionLanguage, string> = {
  en: "Provide each definition in English.",
  "zh-CN": "请使用简体中文撰写每个术语的释义。",
};

export function buildTermExtractionPrompt(text: string, language: DefinitionLanguage): string {
  const instruction = LANGUAGE_INSTRUCTIONS[language] ?? LANGUAGE_INSTRUCTIONS.en;
  return `Analyze the following document and extract the most important terminology. ${instruction} Respond with a JSON array of objects in the shape {"term": "...", "definition": "..."}. Only return JSON.
---
Document:
${text}`;
}
