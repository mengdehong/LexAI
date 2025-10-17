import { describe, expect, it } from "vitest";
import {
  buildTermExtractionPrompt,
  buildOnboardingPrompt,
  buildExplanationPrompt,
  buildTermExpansionPrompt,
} from "../promptBuilder";

describe("promptBuilder", () => {
  it("builds language-aware term extraction prompts", () => {
    const sample = buildTermExtractionPrompt("Networking fundamentals", "en");
    expect(sample).toContain("Provide each definition in English.");
    expect(sample).toContain("Networking fundamentals");

    const chinese = buildTermExtractionPrompt("云计算基础", "zh-CN");
    expect(chinese).toContain("请使用简体中文撰写每个术语的释义。");
  });

  it("normalises onboarding inputs and includes language instructions", () => {
    const prompt = buildOnboardingPrompt(
      { domain: "  Robotics ", proficiency: "beginner", goals: "  master terminology  " },
      "zh-CN",
    );

    expect(prompt).toContain("Robotics");
    expect(prompt).toContain("请使用简体中文撰写每个术语的释义。");
    expect(prompt).toMatch(/Return between 60 and 80/);
  });

  it("truncates long passages when building explanation prompts", () => {
    const longSnippet = "a".repeat(2100);
    const prompt = buildExplanationPrompt(longSnippet, "en");

    const truncatedSegment = "a".repeat(2000) + "…";
    expect(prompt).toContain(truncatedSegment);
    expect(prompt.includes("a".repeat(2100))).toBe(false);
  });

  it("includes bilingual context in term expansion prompts when available", () => {
    const prompt = buildTermExpansionPrompt(
      {
        term: "GPU",
        definition: "Graphics processing unit used for parallel workloads.",
        definitionCn: "图形处理器，用于并行计算。",
        domain: "machine learning",
      },
      "zh-CN",
    );

    expect(prompt).toContain("Existing bilingual definitions");
    expect(prompt).toContain("Use Simplified Chinese for all generated content");
  });
});
