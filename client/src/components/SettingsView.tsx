import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  DefinitionLanguage,
  LexAIConfig,
  ModelMapping,
  ProviderConfig,
  ProviderVendor,
} from "../lib/configStore";
import { loadConfig, saveModelMapping, saveProviders, setDefinitionLanguage } from "../lib/configStore";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { hasApiKey, saveApiKey } from "../lib/apiKeys";
import { useLocale } from "../state/LocaleContext";

type ProviderFormState = {
  id: string | null;
  name: string;
  vendor: ProviderVendor;
  defaultModel: string;
  baseUrl: string;
  apiKey: string;
};

type MappingOperation = keyof ModelMapping;

const INITIAL_PROVIDER_FORM: ProviderFormState = {
  id: null,
  name: "",
  vendor: "openai",
  defaultModel: "",
  baseUrl: "",
  apiKey: "",
};

const MAPPING_LABELS: Record<MappingOperation, string> = {
  termExtraction: "Document Term Extraction",
  explanation: "AI Assisted Definitions",
  onboarding: "Conversational Onboarding",
  deepDive: "Deep Dive",
};

const LANGUAGE_LABELS: Record<DefinitionLanguage, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

const MAPPING_OPERATIONS: MappingOperation[] = ["termExtraction", "explanation", "onboarding", "deepDive"];

function createProviderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `provider-${Date.now()}`;
}

type SettingsViewProps = {
  onLanguageChange?: (language: DefinitionLanguage) => void;
};

export function SettingsView({ onLanguageChange }: SettingsViewProps = {}) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [modelMapping, setModelMapping] = useState<ModelMapping>({});
  const [language, setLanguage] = useState<DefinitionLanguage>("en");
  const uiLanguage = useLocale();
  const isChinese = uiLanguage === "zh-CN";
  const [providerForm, setProviderForm] = useState<ProviderFormState>(INITIAL_PROVIDER_FORM);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingMapping, setSavingMapping] = useState<MappingOperation | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [modelDrafts, setModelDrafts] = useState<Record<MappingOperation, string>>({
    termExtraction: "",
    explanation: "",
    onboarding: "",
    deepDive: "",
  });
  const [storedApiKeys, setStoredApiKeys] = useState<Record<string, boolean>>({});
  const [clearStoredKey, setClearStoredKey] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const resetProviderForm = useCallback(() => {
    setProviderForm(INITIAL_PROVIDER_FORM);
    setClearStoredKey(false);
  }, []);

  const refreshStoredKeys = useCallback(async (entries: ProviderConfig[]) => {
    if (typeof window === "undefined" || !("__TAURI__" in window) || entries.length === 0) {
      setStoredApiKeys(entries.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.id] = false;
        return acc;
      }, {}));
      return;
    }

    try {
      const results = await Promise.all(
        entries.map(async (entry) => {
          try {
            const flag = await hasApiKey(entry.id);
            return [entry.id, flag] as const;
          } catch (error) {
            console.error(`Failed to resolve API key status for ${entry.id}`, error);
            return [entry.id, false] as const;
          }
        }),
      );
      setStoredApiKeys(Object.fromEntries(results));
    } catch (error) {
      console.error("Failed to refresh API key status", error);
    }
  }, []);

  useEffect(() => {
    if (providers.length === 0) {
      setStoredApiKeys({});
      return;
    }
    refreshStoredKeys(providers);
  }, [providers, refreshStoredKeys]);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const config: LexAIConfig = await loadConfig();
        if (!active) {
          return;
        }
        setProviders(config.providers);
        await refreshStoredKeys(config.providers);
        if (!active) {
          return;
        }
        setModelMapping(config.modelMapping);
        setLanguage(config.preferences.definitionLanguage);

        setModelDrafts({
          termExtraction: config.modelMapping.termExtraction?.model ?? "",
          explanation: config.modelMapping.explanation?.model ?? "",
          onboarding: config.modelMapping.onboarding?.model ?? "",
          deepDive: config.modelMapping.deepDive?.model ?? "",
        });
      } catch (err) {
        if (active) {
          const detail = err instanceof Error ? err.message : String(err);
          setError(detail);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    hydrate();
    return () => {
      active = false;
    };
  }, [refreshStoredKeys]);

  const handleEditProvider = useCallback(
    (entry: ProviderConfig) => {
      setProviderForm({
        id: entry.id,
        name: entry.name,
        vendor: entry.vendor,
        defaultModel: entry.defaultModel,
        baseUrl: entry.baseUrl ?? "",
        apiKey: "",
      });
      setClearStoredKey(false);
    },
    [],
  );

  const handleDeleteProvider = useCallback(
    async (providerId: string) => {
      setError(null);
      setInfo(null);
      try {
        const nextProviders = providers.filter((entry) => entry.id !== providerId);
        await saveProviders(nextProviders);
        try {
          await saveApiKey(providerId, "");
        } catch (err) {
          console.error(`Failed to clear API key for provider ${providerId}`, err);
        }
        setProviders(nextProviders);
        if (providerForm.id === providerId) {
          resetProviderForm();
        }

        setStoredApiKeys((prev) => {
          const next = { ...prev };
          delete next[providerId];
          return next;
        });

        const updatedMapping: ModelMapping = { ...modelMapping };
        let changed = false;
        (Object.keys(updatedMapping) as MappingOperation[]).forEach((operation) => {
          if (updatedMapping[operation]?.providerId === providerId) {
            delete updatedMapping[operation];
            changed = true;
          }
        });

        if (changed) {
          await saveModelMapping(updatedMapping);
          setModelMapping(updatedMapping);
          setModelDrafts((prev) => ({
            ...prev,
            termExtraction: updatedMapping.termExtraction?.model ?? "",
            explanation: updatedMapping.explanation?.model ?? "",
            onboarding: updatedMapping.onboarding?.model ?? "",
            deepDive: updatedMapping.deepDive?.model ?? "",
          }));
        }

        setInfo(isChinese ? "已删除 Provider。" : "Provider deleted.");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      }
    },
    [isChinese, modelMapping, providerForm.id, providers, resetProviderForm],
  );

  const handleProviderInputChange = useCallback(
    (field: keyof ProviderFormState, value: string) => {
      setProviderForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleProviderSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (savingProvider) {
        return;
      }
      const trimmedName = providerForm.name.trim();
      const trimmedModel = providerForm.defaultModel.trim();
      if (trimmedName.length === 0 || trimmedModel.length === 0) {
        setError("Provider name and default model are required.");
        return;
      }

      setSavingProvider(true);
      setError(null);
      setInfo(null);

      try {
        let keyMessage: string | null = null;
        const identifier = providerForm.id ?? createProviderId();
        const trimmedApiKey = providerForm.apiKey.trim();
        const entry: ProviderConfig = {
          id: identifier,
          name: trimmedName,
          vendor: providerForm.vendor,
          defaultModel: trimmedModel,
          baseUrl: providerForm.baseUrl.trim() || undefined,
        };

        const nextProviders = providerForm.id
          ? providers.map((item) => (item.id === identifier ? entry : item))
          : [...providers, entry];

        await saveProviders(nextProviders);

        if (trimmedApiKey.length > 0) {
          await saveApiKey(identifier, trimmedApiKey);
          setStoredApiKeys((prev) => ({ ...prev, [identifier]: true }));
          keyMessage = isChinese ? "API Key 已安全保存。" : "API key stored securely.";
        } else if (providerForm.id && clearStoredKey && storedApiKeys[identifier]) {
          await saveApiKey(identifier, "");
          setStoredApiKeys((prev) => ({ ...prev, [identifier]: false }));
          keyMessage = isChinese ? "已删除保存的 API Key。" : "Stored API key removed.";
        }
        setProviders(nextProviders);

        let assignedDefaults = false;
        if (!providerForm.id) {
          const nextMapping: ModelMapping = { ...modelMapping };
          MAPPING_OPERATIONS.forEach((operation) => {
            if (!nextMapping[operation]) {
              nextMapping[operation] = {
                providerId: identifier,
                model: entry.defaultModel,
              };
              assignedDefaults = true;
            }
          });

          if (assignedDefaults) {
            await saveModelMapping(nextMapping);
            setModelMapping(nextMapping);
            setModelDrafts({
              termExtraction: nextMapping.termExtraction?.model ?? "",
              explanation: nextMapping.explanation?.model ?? "",
              onboarding: nextMapping.onboarding?.model ?? "",
              deepDive: nextMapping.deepDive?.model ?? "",
            });
          }
        }

        let infoMessage: string;
        if (providerForm.id) {
          infoMessage = isChinese ? "Provider 已更新。" : "Provider updated.";
        } else if (assignedDefaults) {
          infoMessage = isChinese
            ? "已添加 Provider，并自动关联到未配置的功能。"
            : "Provider added and assigned to unconfigured features.";
        } else {
          infoMessage = isChinese ? "Provider 已添加。" : "Provider added.";
        }

        if (keyMessage) {
          infoMessage = `${infoMessage} ${keyMessage}`;
        }

        setInfo(infoMessage);
        resetProviderForm();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingProvider(false);
      }
    },
    [
      clearStoredKey,
      isChinese,
      modelMapping,
      providerForm,
      providers,
      resetProviderForm,
      savingProvider,
      storedApiKeys,
    ],
  );

  const availableProviderOptions = useMemo(
    () =>
      providers.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.name}
        </option>
      )),
    [providers],
  );

  const handleMappingProviderChange = useCallback(
    async (operation: MappingOperation, providerId: string) => {
      setSavingMapping(operation);
      setError(null);
      setInfo(null);

      try {
        const nextMapping: ModelMapping = { ...modelMapping };
        if (!providerId) {
          delete nextMapping[operation];
          await saveModelMapping(nextMapping);
          setModelMapping(nextMapping);
          setModelDrafts((prev) => ({ ...prev, [operation]: "" }));
          setInfo(isChinese ? "映射已更新。" : "Mapping updated.");
          return;
        }

        const provider = providers.find((entry) => entry.id === providerId);
        if (!provider) {
          throw new Error("Selected provider does not exist.");
        }

        const currentModel = modelDrafts[operation] || provider.defaultModel;
        nextMapping[operation] = {
          providerId,
          model: currentModel || provider.defaultModel,
        };

        await saveModelMapping(nextMapping);
        setModelMapping(nextMapping);
        setModelDrafts((prev) => ({ ...prev, [operation]: nextMapping[operation]!.model }));
        setInfo(isChinese ? "映射已更新。" : "Mapping updated.");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingMapping(null);
      }
    },
    [isChinese, modelDrafts, modelMapping, providers],
  );

  const handleMappingModelBlur = useCallback(
    async (operation: MappingOperation) => {
      const draftValue = modelDrafts[operation]?.trim();
      if (!draftValue) {
        return;
      }

      const currentEntry = modelMapping[operation];
      if (!currentEntry) {
        return;
      }

      if (currentEntry.model === draftValue) {
        return;
      }

      setSavingMapping(operation);
      setError(null);
      setInfo(null);
      try {
        const nextMapping: ModelMapping = { ...modelMapping };
        nextMapping[operation] = {
          ...currentEntry,
          model: draftValue,
        };
        await saveModelMapping(nextMapping);
        setModelMapping(nextMapping);
        setInfo(isChinese ? "映射已更新。" : "Mapping updated.");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingMapping(null);
      }
    },
    [isChinese, modelDrafts, modelMapping],
  );

  const handleModelInputChange = useCallback(
    (operation: MappingOperation, value: string) => {
      setModelDrafts((prev) => ({ ...prev, [operation]: value }));
    },
    [],
  );

  const handleLanguageChange = useCallback(
    async (value: DefinitionLanguage) => {
      setSavingLanguage(true);
      setError(null);
      setInfo(null);
      try {
        await setDefinitionLanguage(value);
        setLanguage(value);
        setInfo(isChinese ? "偏好设置已保存。" : "Preference saved.");
        onLanguageChange?.(value);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingLanguage(false);
      }
    },
    [isChinese, onLanguageChange],
  );

  const languageOptions = useMemo(
    () =>
      (Object.keys(LANGUAGE_LABELS) as DefinitionLanguage[]).map((value) => (
        <option key={value} value={value}>
          {LANGUAGE_LABELS[value]}
        </option>
      )),
    [],
  );

  if (loading) {
    return (
      <section className="panel">
        <header className="panel__header">
          <h2>{isChinese ? "设置" : "Settings"}</h2>
        </header>
        <p className="panel__status">{isChinese ? "正在加载配置…" : "Loading configuration…"}</p>
      </section>
    );
  }

  return (
    <div className="settings-grid">
      <section className="panel">
        <header className="panel__header">
          <h2>{isChinese ? "AI Provider 配置" : "AI Providers"}</h2>
        </header>
        {error && <p className="panel__status error">{error}</p>}
        {info && <p className="panel__status success">{info}</p>}
        <form className="provider-form" onSubmit={handleProviderSubmit}>
          <div className="provider-form__row">
            <label>
              {isChinese ? "名称" : "Name"}
              <input
                type="text"
                value={providerForm.name}
                onChange={(event) => handleProviderInputChange("name", event.target.value)}
                required
              />
            </label>
            <label>
              {isChinese ? "厂商" : "Vendor"}
              <select
                value={providerForm.vendor}
                onChange={(event) => handleProviderInputChange("vendor", event.target.value as ProviderVendor)}
              >
                <option value="openai">{isChinese ? "OpenAI 兼容" : "OpenAI Compatible"}</option>
                <option value="gemini">{isChinese ? "Google Gemini" : "Google Gemini"}</option>
                <option value="custom">{isChinese ? "自定义" : "Custom"}</option>
              </select>
            </label>
          </div>
          <div className="provider-form__row">
            <label>
              {isChinese ? "默认模型" : "Default Model"}
              <input
                type="text"
                value={providerForm.defaultModel}
                onChange={(event) => handleProviderInputChange("defaultModel", event.target.value)}
                required
              />
            </label>
            <label>
              {isChinese ? "Base URL（可选）" : "Base URL (optional)"}
              <input
                type="url"
                placeholder="https://api.example.com/v1"
                value={providerForm.baseUrl}
                onChange={(event) => handleProviderInputChange("baseUrl", event.target.value)}
              />
            </label>
          </div>
          <div className="provider-form__row">
            <label className="provider-form__api-key">
              {isChinese
                ? "API Key（可选，将安全存储）"
                : "API Key (optional, stored securely)"}
              <input
                type="password"
                value={providerForm.apiKey}
                onChange={(event) => handleProviderInputChange("apiKey", event.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </label>
          </div>
          {providerForm.id && storedApiKeys[providerForm.id] && (
            <div className="provider-form__row">
              <label className="provider-form__api-key">
                <input
                  type="checkbox"
                  checked={clearStoredKey}
                  onChange={(event) => setClearStoredKey(event.target.checked)}
                />
                {isChinese ? "删除已保存的 API Key" : "Remove stored API key"}
              </label>
            </div>
          )}
          <div className="provider-form__actions">
            <button
              type="button"
              className="pill-button pill-light provider-form__test"
              onClick={async () => {
                setError(null);
                setInfo(null);
                try {
                  const active = providerForm.id
                    ? providers.find((p) => p.id === providerForm.id)
                    : { id: "__temp__", name: providerForm.name || "(temp)", vendor: providerForm.vendor, defaultModel: providerForm.defaultModel || "", baseUrl: providerForm.baseUrl || undefined };
                  if (!active || !active.name || !active.defaultModel) {
                    throw new Error(isChinese ? "请先填写名称与默认模型。" : "Please fill name and default model first.");
                  }
                  const { testProvider } = await import("../lib/llmClient");
                  setSavingProvider(true);
                  await testProvider(active, providerForm.apiKey.trim() || undefined);
                  setInfo(isChinese ? "连接正常。" : "Connection verified.");
                } catch (err) {
                  const detail = err instanceof Error ? err.message : String(err);
                  setError(detail);
                } finally {
                  setSavingProvider(false);
                }
              }}
              disabled={savingProvider}
            >
              {savingProvider ? (isChinese ? "测试中…" : "Testing…") : (isChinese ? "测试连接" : "Test Connection")}
            </button>
            <button type="submit" className="pill-button pill-light" disabled={savingProvider}>
              {savingProvider
                ? isChinese
                  ? "正在保存…"
                  : "Saving…"
                : providerForm.id
                ? isChinese
                  ? "更新 Provider"
                  : "Update Provider"
                : isChinese
                ? "添加 Provider"
                : "Add Provider"}
            </button>
            {providerForm.id && (
              <button
                type="button"
                onClick={resetProviderForm}
                className="provider-form__reset pill-button pill-light"
                disabled={savingProvider}
              >
                {isChinese ? "取消编辑" : "Cancel Edit"}
              </button>
            )}
          </div>
        </form>
        <ul className="panel__list">
          {providers.length === 0 && <li>{isChinese ? "尚未配置任何 Provider。" : "No providers configured."}</li>}
          {providers.map((provider) => (
            <li key={provider.id} className="panel__list-item">
                <div className="provider-entry">
                  <div>
                    <strong>{provider.name}</strong>
                    <span className="panel__list-subtitle">
                      {isChinese ? `厂商：${provider.vendor}` : `Vendor: ${provider.vendor}`}
                    </span>
                    <span className="panel__list-subtitle">
                      {isChinese ? `默认模型：${provider.defaultModel}` : `Default model: ${provider.defaultModel}`}
                    </span>
                    {provider.baseUrl && <span className="panel__list-subtitle">Base URL: {provider.baseUrl}</span>}
                    <span className="panel__list-subtitle">
                      {storedApiKeys[provider.id]
                        ? isChinese
                          ? "API Key 已安全存储。"
                          : "API key stored securely."
                        : isChinese
                        ? "从环境变量读取"
                        : "Read from environment"}
                    </span>
                  </div>
                <div className="provider-entry__actions">
                  <button type="button" className="pill-button pill-light" onClick={() => handleEditProvider(provider)}>
                    {isChinese ? "编辑" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className="pill-button pill-light"
                    onClick={async () => {
                      setError(null);
                      setInfo(null);
                      setTestingProviderId(provider.id);
                      try {
                        const { testProvider } = await import("../lib/llmClient");
                        await testProvider(provider);
                        setInfo(isChinese ? "连接正常。" : "Connection verified.");
                      } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err);
                        setError(detail);
                      } finally {
                        setTestingProviderId(null);
                      }
                    }}
                    disabled={testingProviderId === provider.id}
                  >
                    {testingProviderId === provider.id ? (isChinese ? "测试中…" : "Testing…") : (isChinese ? "测试" : "Test")}
                  </button>
                  <button type="button" className="pill-button negative" onClick={() => handleDeleteProvider(provider.id)}>
                    {isChinese ? "删除" : "Delete"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2>{isChinese ? "功能模型映射" : "Function-to-Model Mapping"}</h2>
        </header>
        <div className="mapping-list">
          {(Object.keys(MAPPING_LABELS) as MappingOperation[]).map((operation) => {
            const current = modelMapping[operation];
            return (
              <div key={operation} className="mapping-entry">
                <div className="mapping-entry__header">
                  <strong>
                    {isChinese
                      ? {
                          termExtraction: "文档术语提取",
                          explanation: "AI 释义助手",
                          onboarding: "对话式引导",
                          deepDive: "联想",
                        }[operation]
                      : MAPPING_LABELS[operation]}
                  </strong>
                  {current && (
                    <span className="panel__list-subtitle">
                      {providers.find((provider) => provider.id === current.providerId)?.name || "Unknown"}
                    </span>
                  )}
                </div>
                <div className="mapping-entry__controls">
                  <label>
                    {isChinese ? "Provider" : "Provider"}
                    <select
                      value={current?.providerId ?? ""}
                      onChange={(event) => handleMappingProviderChange(operation, event.target.value)}
                      disabled={providers.length === 0 || savingMapping === operation}
                    >
                      <option value="">{isChinese ? "未配置" : "Not assigned"}</option>
                      {availableProviderOptions}
                    </select>
                  </label>
                  <label>
                    {isChinese ? "模型" : "Model"}
                    <input
                      type="text"
                      value={modelDrafts[operation] ?? ""}
                      onChange={(event) => handleModelInputChange(operation, event.target.value)}
                      onBlur={() => handleMappingModelBlur(operation)}
                      disabled={!current || savingMapping === operation}
                      placeholder="Enter model name"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2>{isChinese ? "用户偏好" : "User Preferences"}</h2>
        </header>
        <div className="preferences-form">
          <label>
            {isChinese ? "术语释义语言" : "Definition language"}
            <select
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value as DefinitionLanguage)}
              disabled={savingLanguage}
            >
              {languageOptions}
            </select>
          </label>
        </div>
        <div className="settings-diagnostics">
          <button
            type="button"
            className="settings-diagnostics-toggle"
            onClick={() => setShowDiagnostics((v) => !v)}
          >
            {showDiagnostics ? (isChinese ? "关闭诊断" : "Hide Diagnostics") : (isChinese ? "打开诊断" : "Open Diagnostics")}
          </button>
        </div>
        {showDiagnostics && (
          <div className="settings-diagnostics-body">
            <DiagnosticsPanel onClose={() => setShowDiagnostics(false)} />
          </div>
        )}
      </section>
    </div>
  );
}
