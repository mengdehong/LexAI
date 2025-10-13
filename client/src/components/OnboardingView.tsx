import { FormEvent, useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { DefinitionLanguage } from "../lib/configStore";
import { markOnboardingComplete } from "../lib/configStore";
import { generateOnboardingTerms } from "../lib/llmClient";
import type { OnboardingProfile } from "../lib/promptBuilder";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type OnboardingViewProps = {
  language: DefinitionLanguage;
  hasOnboardingMapping: boolean;
  onRequestSettings: () => void;
  onComplete: () => void;
};

type StoredTerm = {
  id: number;
  term: string;
  definition: string;
};

const PROFICIENCY_OPTIONS: Array<{ label: string; value: OnboardingProfile["proficiency"]; helper: string }>= [
  { label: "Beginner", value: "beginner", helper: "I rely on translations for most specialist content." },
  { label: "Intermediate", value: "intermediate", helper: "I can read most materials with occasional lookups." },
  { label: "Advanced", value: "advanced", helper: "I handle expert materials but want sharper terminology." },
];

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
}: OnboardingViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "assistant",
      language === "zh-CN"
        ? "欢迎来到 LexAI！为了更好地帮助你，我想先了解一些背景。请告诉我你所专注的专业领域。"
        : "Welcome to LexAI! To personalise your starter glossary, tell me about the domain you work or study in.",
    ),
  ]);
  const [domain, setDomain] = useState("");
  const [proficiency, setProficiency] = useState<OnboardingProfile["proficiency"]>("intermediate");
  const [goals, setGoals] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

    try {
      const profile: OnboardingProfile = {
        domain: domain.trim(),
        proficiency,
        goals: goals.trim(),
      };

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

      await Promise.all(
        terms.map((entry) => {
          const key = entry.term.toLowerCase();
          const current = lookup.get(key);
          if (current) {
            return invoke("update_term", {
              id: current.id,
              term: entry.term,
              definition: entry.definition,
            });
          }
          return invoke("add_term", { term: entry.term, definition: entry.definition });
        }),
      );

      await markOnboardingComplete();

      setSuccessMessage(
        language === "zh-CN"
          ? "初始术语库已生成，正在跳转至全局术语库。"
          : "Starter glossary created! Redirecting you to the global termbase.",
      );

      setTimeout(() => {
        onComplete();
      }, 800);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail || "Failed to complete onboarding.");
    } finally {
      setBusy(false);
    }
  }, [busy, domain, goals, hasOnboardingMapping, language, onComplete, proficiency]);

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

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true">
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <div>
            <h1>LexAI Onboarding</h1>
            <p>
              {language === "zh-CN"
                ? "花几分钟，通过 AI 对话生成专属于你的初始术语库。"
                : "Spend a minute with LexAI to generate a personalised starter glossary."}
            </p>
          </div>
          {!hasOnboardingMapping && (
            <button type="button" onClick={onRequestSettings} className="onboarding-secondary">
              {language === "zh-CN" ? "前往设置 provider" : "Configure providers"}
            </button>
          )}
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
