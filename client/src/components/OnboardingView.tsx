import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { DefinitionLanguage } from "../lib/configStore";
import { loadConfig, markOnboardingComplete } from "../lib/configStore";
import { generateOnboardingTerms } from "../lib/llmClient";
import type { OnboardingProfile } from "../lib/promptBuilder";
import { useAppState } from "../state/AppState";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type OnboardingMode = "initial" | "generator";

type OnboardingViewProps = {
  language: DefinitionLanguage;
  hasOnboardingMapping: boolean;
  onRequestSettings: () => void;
  onComplete: () => void;
  mode?: OnboardingMode;
  onDismiss?: () => void;
};

type StoredTerm = {
  id: number;
  term: string;
  definition: string;
  definition_cn: string | null;
  review_stage: number;
  last_reviewed_at: string | null;
};

const PROFICIENCY_OPTIONS: Array<{ label: string; value: OnboardingProfile["proficiency"]; helper: string }>= [
  { label: "Beginner", value: "beginner", helper: "I rely on translations for most specialist content." },
  { label: "Intermediate", value: "intermediate", helper: "I can read most materials with occasional lookups." },
  { label: "Advanced", value: "advanced", helper: "I handle expert materials but want sharper terminology." },
];

const PROGRESS_SEQUENCE = ["preparing", "generating", "saving"] as const;
type ActiveProgress = (typeof PROGRESS_SEQUENCE)[number];
type ProgressPhase = "idle" | ActiveProgress;

const PROGRESS_COPY: Record<DefinitionLanguage, Record<ActiveProgress, string>> = {
  en: {
    preparing: "Preparing personalised prompt…",
    generating: "Requesting glossary from the AI provider…",
    saving: "Saving terms into your global termbase…",
  },
  "zh-CN": {
    preparing: "正在整理个性化提示词…",
    generating: "正在向模型请求术语列表…",
    saving: "正在将术语写入全局术语库…",
  },
};

const INITIAL_PROMPTS: Record<OnboardingMode, Record<DefinitionLanguage, string>> = {
  initial: {
    en: "Welcome to LexAI! To personalise your starter glossary, tell me about the domain you work or study in.",
    "zh-CN": "欢迎来到 LexAI！为了更好地帮助你，我想先了解一些背景。请告诉我你所专注的专业领域。",
  },
  generator: {
    en: "Ready to expand your knowledge network? Start by telling me which domain you want the AI to focus on.",
    "zh-CN": "准备扩充你的术语库了吗？先告诉我这次希望聚焦的专业领域吧。",
  },
};

const HEADER_COPY: Record<OnboardingMode, Record<DefinitionLanguage, { title: string; subtitle: string }>> = {
  initial: {
    en: {
      title: "LexAI Onboarding",
      subtitle: "Spend a minute with LexAI to generate a personalised starter glossary.",
    },
    "zh-CN": {
      title: "LexAI Onboarding",
      subtitle: "花几分钟，通过 AI 对话生成专属于你的初始术语库。",
    },
  },
  generator: {
    en: {
      title: "AI Glossary Generator",
      subtitle: "Answer a few quick questions and let LexAI craft new terms for your global termbase.",
    },
    "zh-CN": {
      title: "AI 术语生成器",
      subtitle: "回答几个小问题，LexAI 即可为你的全局术语库生成全新词条。",
    },
  },
};

const SUCCESS_COPY: Record<OnboardingMode, Record<DefinitionLanguage, string>> = {
  initial: {
    en: "Starter glossary created! Redirecting you to the global termbase.",
    "zh-CN": "初始术语库已生成，正在跳转至全局术语库。",
  },
  generator: {
    en: "AI-generated terms merged into your global termbase.",
    "zh-CN": "AI 生成的术语已合并进你的全局术语库。",
  },
};

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, role, content };
}

export function OnboardingView({
  language,
  hasOnboardingMapping,
  onRequestSettings,
  onComplete,
  mode = "initial",
  onDismiss,
}: OnboardingViewProps) {
  const { refreshGlobalTerms } = useAppState();
  const initialAssistantMessage = useMemo(() => INITIAL_PROMPTS[mode][language], [language, mode]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createMessage("assistant", initialAssistantMessage),
  ]);
  const [domain, setDomain] = useState("");
  const [proficiency, setProficiency] = useState<OnboardingProfile["proficiency"]>("intermediate");
  const [goals, setGoals] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressPhase>("idle");
  const [modelHint, setModelHint] = useState<string | null>(null);
  const [currentModelLabel, setCurrentModelLabel] = useState<string | null>(null);

  useEffect(() => {
    setMessages([createMessage("assistant", initialAssistantMessage)]);
    setDomain("");
    setProficiency("intermediate");
    setGoals("");
    setStep(0);
    setBusy(false);
    setError(null);
    setSuccessMessage(null);
    setProgress("idle");
    setModelHint(null);
    setCurrentModelLabel(null);
  }, [initialAssistantMessage]);

  useEffect(() => {
    if (mode !== "generator") {
      return;
    }
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [mode]);

  const canSubmit = useMemo(() => {
    if (!hasOnboardingMapping) {
      return false;
    }
    if (step === 0) {
      return domain.trim().length > 0;
    }
    if (step === 1) {
      return !!proficiency;
    }
    if (step === 2) {
      return goals.trim().length > 0;
    }
    return true;
  }, [domain, goals, hasOnboardingMapping, proficiency, step]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const config = await loadConfig();
        if (!active) {
          return;
        }
        const mapping = config.modelMapping.onboarding;
        if (!mapping) {
          setCurrentModelLabel(null);
          setModelHint(null);
          return;
        }

        const provider = config.providers.find((entry) => entry.id === mapping.providerId);
        const providerLabel = provider?.name?.trim() || provider?.vendor || mapping.providerId;
        const modelLabel = mapping.model?.trim() ?? "";
        const combinedLabel = modelLabel ? `${providerLabel} · ${modelLabel}` : providerLabel;
        setCurrentModelLabel(combinedLabel);

        const normalizedModel = modelLabel.toLowerCase();
        const baseRecommendationEn =
          "For richer starter glossaries, consider mapping onboarding to GPT-4o or Claude 3 Sonnet. These premium models cost more and may take longer, but deliver higher quality terminology.";
        const baseRecommendationZh =
          "若希望获得更高质量的术语库，建议在设置中将对话式引导绑定到 GPT-4o 或 Claude 3 Sonnet 等高阶模型。它们成本更高、耗时更长，但能提供更全面的术语。";
        const highQuality =
          /gpt-4|claude-3|sonnet|opus|gemini-1\.5.*(pro|ultra)|claude\s*3\.5/.test(normalizedModel);
        const prefersSpeed =
          (provider?.vendor === "gemini" && /flash/.test(normalizedModel)) ||
          (provider?.vendor === "openai" && /gpt-3\.5|mini/.test(normalizedModel));

        let note: string | null;
        if (highQuality) {
          note =
            language === "zh-CN"
              ? "你正在使用高质量模型，生成过程可能稍久，但会带来更丰富的术语成果。"
              : "You’re already using a high-quality model; generation may take a little longer but yields richer terminology.";
        } else if (prefersSpeed) {
          note =
            language === "zh-CN"
              ? "当前模型偏向速度。若想提升术语质量，可在设置中改用 GPT-4o 或 Claude 3 Sonnet。"
              : "The current model prioritises speed. Switch to GPT-4o or Claude 3 Sonnet in Settings for higher-quality glossaries.";
        } else {
          note = language === "zh-CN" ? baseRecommendationZh : baseRecommendationEn;
        }

        setModelHint(note);
      } catch (err) {
        if (!active) {
          return;
        }
        setCurrentModelLabel(null);
        setModelHint(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [language]);

  const enqueueAssistantMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [...prev, createMessage("assistant", content)]);
    },
    [setMessages],
  );

  const enqueueUserMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [...prev, createMessage("user", content)]);
    },
    [setMessages],
  );

  const progressMessage = useMemo(() => {
    if (progress === "idle") {
      return null;
    }
    const step = progress as ActiveProgress;
    const index = PROGRESS_SEQUENCE.indexOf(step);
    if (index === -1) {
      return null;
    }
    const label = PROGRESS_COPY[language]?.[step];
    if (!label) {
      return null;
    }
    const total = PROGRESS_SEQUENCE.length;
    if (language === "zh-CN") {
      return `进度 ${index + 1}/${total}：${label}`;
    }
    return `Progress ${index + 1}/${total}: ${label}`;
  }, [language, progress]);

  const handleDomainSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }

      const trimmed = domain.trim();
      enqueueUserMessage(trimmed);
      enqueueAssistantMessage(
        language === "zh-CN"
          ? "了解啦！你的英语能力处于什么水平？"
          : "Got it. How would you describe your current English proficiency for this domain?",
      );
      setStep(1);
    },
    [canSubmit, domain, enqueueAssistantMessage, enqueueUserMessage, language],
  );

  const handleProficiencySubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }

      const meta = PROFICIENCY_OPTIONS.find((item) => item.value === proficiency);
      enqueueUserMessage(meta?.label ?? proficiency);
      enqueueAssistantMessage(
        language === "zh-CN"
          ? "好的！最后，请告诉我你希望通过 LexAI 实现的学习目标。"
          : "Great! Finally, what goals do you want LexAI to help you accomplish?",
      );
      setStep(2);
    },
    [canSubmit, enqueueAssistantMessage, enqueueUserMessage, language, proficiency],
  );

  const handleGoalsSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }

      const trimmed = goals.trim();
      enqueueUserMessage(trimmed);
      enqueueAssistantMessage(
        language === "zh-CN"
          ? "完美！我已经准备好为你定制初始术语库。确认信息后点击生成吧。"
          : "Excellent! Review your profile and generate your personalised starter glossary when ready.",
      );
      setStep(3);
    },
    [canSubmit, enqueueAssistantMessage, enqueueUserMessage, goals, language],
  );

  const handleGenerate = useCallback(async () => {
    if (busy || !hasOnboardingMapping) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    setProgress("preparing");

    try {
      const profile: OnboardingProfile = {
        domain: domain.trim(),
        proficiency,
        goals: goals.trim(),
      };

      setProgress("generating");
      const terms = await generateOnboardingTerms(profile);
      if (terms.length === 0) {
        throw new Error(
          language === "zh-CN"
            ? "模型没有返回任何术语，请稍后重试。"
            : "The language model did not return any terms. Please try again.",
        );
      }

      const existing = await invoke<StoredTerm[]>("get_all_terms");
      const lookup = new Map(existing.map((item) => [item.term.toLowerCase(), item]));

      setProgress("saving");
      await Promise.all(
        terms.map((entry) => {
          const key = entry.term.toLowerCase();
          const current = lookup.get(key);
          if (current) {
            return invoke("update_term", {
              id: current.id,
              term: entry.term,
              definition: entry.definition,
              definition_cn: entry.definition_cn ?? null,
            });
          }
          return invoke("add_term", {
            term: entry.term,
            definition: entry.definition,
            definition_cn: entry.definition_cn ?? null,
          });
        }),
      );
      await refreshGlobalTerms();

      if (mode === "initial") {
        await markOnboardingComplete();
      }

      setSuccessMessage(SUCCESS_COPY[mode][language]);

      setTimeout(() => {
        onComplete();
      }, 800);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail || "Failed to complete onboarding.");
    } finally {
      setProgress("idle");
      setBusy(false);
    }
  }, [busy, domain, goals, hasOnboardingMapping, language, mode, onComplete, proficiency, refreshGlobalTerms]);

  const renderForm = () => {
    if (step === 0) {
      return (
        <form className="onboarding-form" onSubmit={handleDomainSubmit}>
          <label>
            <span>Domain focus</span>
            <input
              type="text"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder={
                language === "zh-CN"
                  ? "例如：人工智能、财务分析、临床医学"
                  : "e.g. AI safety research, financial analysis, clinical medicine"
              }
              disabled={!hasOnboardingMapping || busy}
            />
          </label>
          <button type="submit" disabled={!canSubmit || busy}>
            {language === "zh-CN" ? "下一步" : "Next"}
          </button>
        </form>
      );
    }

    if (step === 1) {
      return (
        <form className="onboarding-form" onSubmit={handleProficiencySubmit}>
          <label>
            <span>English proficiency</span>
            <select
              value={proficiency}
              onChange={(event) => setProficiency(event.target.value as OnboardingProfile["proficiency"])}
              disabled={!hasOnboardingMapping || busy}
            >
              {PROFICIENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="onboarding-helper">{PROFICIENCY_OPTIONS.find((item) => item.value === proficiency)?.helper}</p>
          </label>
          <button type="submit" disabled={!canSubmit || busy}>
            {language === "zh-CN" ? "下一步" : "Next"}
          </button>
        </form>
      );
    }

    if (step === 2) {
      return (
        <form className="onboarding-form" onSubmit={handleGoalsSubmit}>
          <label>
            <span>Learning goals</span>
            <textarea
              value={goals}
              onChange={(event) => setGoals(event.target.value)}
              rows={4}
              placeholder={
                language === "zh-CN"
                  ? "例如：能够快速阅读顶会论文；准备面向客户的解决方案汇报"
                  : "e.g. accelerate top-conference paper reading; prepare client-ready solution briefings"
              }
              disabled={!hasOnboardingMapping || busy}
            />
          </label>
          <button type="submit" disabled={!canSubmit || busy}>
            {language === "zh-CN" ? "下一步" : "Next"}
          </button>
        </form>
      );
    }

    return (
      <div className="onboarding-summary">
        <dl>
          <div>
            <dt>{language === "zh-CN" ? "专业领域" : "Domain"}</dt>
            <dd>{domain || "—"}</dd>
          </div>
          <div>
            <dt>{language === "zh-CN" ? "语言水平" : "Proficiency"}</dt>
            <dd>{PROFICIENCY_OPTIONS.find((item) => item.value === proficiency)?.label ?? proficiency}</dd>
          </div>
          <div>
            <dt>{language === "zh-CN" ? "学习目标" : "Goals"}</dt>
            <dd>{goals || "—"}</dd>
          </div>
        </dl>
        {busy && progressMessage && (
          <p className="onboarding-helper onboarding-progress-status">{progressMessage}</p>
        )}
        <button type="button" onClick={handleGenerate} disabled={busy || !hasOnboardingMapping}>
          {busy
            ? language === "zh-CN"
              ? "正在生成……"
              : "Generating…"
            : language === "zh-CN"
            ? "生成我的术语库"
            : "Generate my glossary"}
        </button>
      </div>
    );
  };

  const headerCopy = HEADER_COPY[mode][language];

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true">
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <div>
            <h1>{headerCopy.title}</h1>
            <p>{headerCopy.subtitle}</p>
          </div>
          <div className="onboarding-header__actions">
            {mode === "generator" && onDismiss && (
              <button type="button" onClick={onDismiss} className="onboarding-secondary">
                {language === "zh-CN" ? "退出" : "Close"}
              </button>
            )}
            {!hasOnboardingMapping && (
              <button type="button" onClick={onRequestSettings} className="onboarding-secondary">
                {language === "zh-CN" ? "前往设置 provider" : "Configure providers"}
              </button>
            )}
          </div>
        </header>

        {error && <div className="onboarding-toast error">{error}</div>}
        {successMessage && <div className="onboarding-toast success">{successMessage}</div>}
        {!hasOnboardingMapping && (
          <div className="onboarding-alert">
            {language === "zh-CN"
              ? "请先在设置中为“对话式引导”绑定一个模型。"
              : "Please assign a model to the onboarding operation in Settings before continuing."}
          </div>
        )}
        {currentModelLabel && (
          <p className="onboarding-helper onboarding-model-label">
            {language === "zh-CN"
              ? `当前对话式引导模型：${currentModelLabel}`
              : `Current onboarding model: ${currentModelLabel}`}
          </p>
        )}
        {modelHint && <p className="onboarding-helper onboarding-model-hint">{modelHint}</p>}

        <div className="onboarding-chat">
          <ul>
            {messages.map((message) => (
              <li key={message.id} className={message.role === "assistant" ? "assistant" : "user"}>
                <span>{message.content}</span>
              </li>
            ))}
          </ul>
        </div>

        <footer className="onboarding-footer" aria-busy={busy}>
          {renderForm()}
        </footer>
      </div>
    </div>
  );
}
