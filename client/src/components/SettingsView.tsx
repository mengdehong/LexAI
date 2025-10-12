import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  DefinitionLanguage,
  LexAIConfig,
  ModelMapping,
  ProviderConfig,
  ProviderVendor,
} from "../lib/configStore";
import { loadConfig, saveModelMapping, saveProviders, setDefinitionLanguage } from "../lib/configStore";

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
};

const LANGUAGE_LABELS: Record<DefinitionLanguage, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

const MAPPING_OPERATIONS: MappingOperation[] = ["termExtraction", "explanation", "onboarding"];

function createProviderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `provider-${Date.now()}`;
}

export function SettingsView() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [modelMapping, setModelMapping] = useState<ModelMapping>({});
  const [language, setLanguage] = useState<DefinitionLanguage>("en");
  const [providerForm, setProviderForm] = useState<ProviderFormState>(INITIAL_PROVIDER_FORM);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingMapping, setSavingMapping] = useState<MappingOperation | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modelDrafts, setModelDrafts] = useState<Record<MappingOperation, string>>({
    termExtraction: "",
    explanation: "",
    onboarding: "",
  });

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const config: LexAIConfig = await loadConfig();
        if (!active) {
          return;
        }
        setProviders(config.providers);
        setModelMapping(config.modelMapping);
        setLanguage(config.preferences.definitionLanguage);

        setModelDrafts({
          termExtraction: config.modelMapping.termExtraction?.model ?? "",
          explanation: config.modelMapping.explanation?.model ?? "",
          onboarding: config.modelMapping.onboarding?.model ?? "",
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
  }, []);

  const resetProviderForm = useCallback(() => {
    setProviderForm(INITIAL_PROVIDER_FORM);
  }, []);

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
        setProviders(nextProviders);
        if (providerForm.id === providerId) {
          resetProviderForm();
        }

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
          }));
        }

        setInfo("Provider deleted.");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      }
    },
    [modelMapping, providerForm.id, providers, resetProviderForm],
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
        const identifier = providerForm.id ?? createProviderId();
        const trimmedApiKey = providerForm.apiKey.trim();
        const existing = providerForm.id
          ? providers.find((item) => item.id === identifier)
          : undefined;
        const entry: ProviderConfig = {
          id: identifier,
          name: trimmedName,
          vendor: providerForm.vendor,
          defaultModel: trimmedModel,
          baseUrl: providerForm.baseUrl.trim() || undefined,
          apiKey: trimmedApiKey ? trimmedApiKey : existing?.apiKey,
        };

        const nextProviders = providerForm.id
          ? providers.map((item) => (item.id === identifier ? entry : item))
          : [...providers, entry];

        await saveProviders(nextProviders);
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
            });
          }
        }

        if (providerForm.id) {
          setInfo("Provider updated.");
        } else if (assignedDefaults) {
          setInfo("Provider added and assigned to unconfigured features.");
        } else {
          setInfo("Provider added.");
        }
        resetProviderForm();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingProvider(false);
      }
    },
    [modelMapping, providerForm, providers, resetProviderForm, savingProvider],
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
          setInfo("Mapping updated.");
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
        setInfo("Mapping updated.");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingMapping(null);
      }
    },
    [modelDrafts, modelMapping, providers],
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
        setInfo("Mapping updated.");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingMapping(null);
      }
    },
    [modelDrafts, modelMapping],
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
        setInfo("Preference saved.");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
      } finally {
        setSavingLanguage(false);
      }
    },
    [],
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
          <h2>Settings</h2>
        </header>
        <p className="panel__status">Loading configuration…</p>
      </section>
    );
  }

  return (
    <div className="settings-grid">
      <section className="panel">
        <header className="panel__header">
          <h2>AI Providers</h2>
        </header>
        {error && <p className="panel__status error">{error}</p>}
        {info && <p className="panel__status success">{info}</p>}
        <form className="provider-form" onSubmit={handleProviderSubmit}>
          <div className="provider-form__row">
            <label>
              Name
              <input
                type="text"
                value={providerForm.name}
                onChange={(event) => handleProviderInputChange("name", event.target.value)}
                required
              />
            </label>
            <label>
              Vendor
              <select
                value={providerForm.vendor}
                onChange={(event) => handleProviderInputChange("vendor", event.target.value as ProviderVendor)}
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="gemini">Google Gemini</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>
          <div className="provider-form__row">
            <label>
              Default Model
              <input
                type="text"
                value={providerForm.defaultModel}
                onChange={(event) => handleProviderInputChange("defaultModel", event.target.value)}
                required
              />
            </label>
            <label>
              Base URL (optional)
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
              API Key (optional, leave blank to use environment variables)
              <input
                type="password"
                value={providerForm.apiKey}
                onChange={(event) => handleProviderInputChange("apiKey", event.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </label>
          </div>
          <div className="provider-form__actions">
            <button type="submit" disabled={savingProvider}>
              {savingProvider ? "Saving…" : providerForm.id ? "Update Provider" : "Add Provider"}
            </button>
            {providerForm.id && (
              <button
                type="button"
                onClick={resetProviderForm}
                className="provider-form__reset"
                disabled={savingProvider}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
        <ul className="panel__list">
          {providers.length === 0 && <li>No providers configured.</li>}
          {providers.map((provider) => (
            <li key={provider.id} className="panel__list-item">
                <div className="provider-entry">
                  <div>
                    <strong>{provider.name}</strong>
                    <span className="panel__list-subtitle">
                      {provider.vendor} • Model: {provider.defaultModel}
                    </span>
                    {provider.baseUrl && <span className="panel__list-subtitle">Base URL: {provider.baseUrl}</span>}
                    <span className="panel__list-subtitle">
                      {provider.apiKey ? "API key stored in configuration." : "API key will be read from environment variables."}
                    </span>
                  </div>
                <div className="provider-entry__actions">
                  <button type="button" onClick={() => handleEditProvider(provider)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDeleteProvider(provider.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2>Function-to-Model Mapping</h2>
        </header>
        <div className="mapping-list">
          {(Object.keys(MAPPING_LABELS) as MappingOperation[]).map((operation) => {
            const current = modelMapping[operation];
            return (
              <div key={operation} className="mapping-entry">
                <div className="mapping-entry__header">
                  <strong>{MAPPING_LABELS[operation]}</strong>
                  {current && (
                    <span className="panel__list-subtitle">
                      {providers.find((provider) => provider.id === current.providerId)?.name || "Unknown"}
                    </span>
                  )}
                </div>
                <div className="mapping-entry__controls">
                  <label>
                    Provider
                    <select
                      value={current?.providerId ?? ""}
                      onChange={(event) => handleMappingProviderChange(operation, event.target.value)}
                      disabled={providers.length === 0 || savingMapping === operation}
                    >
                      <option value="">Not assigned</option>
                      {availableProviderOptions}
                    </select>
                  </label>
                  <label>
                    Model
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
          <h2>User Preferences</h2>
        </header>
        <div className="preferences-form">
          <label>
            Definition language
            <select
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value as DefinitionLanguage)}
              disabled={savingLanguage}
            >
              {languageOptions}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
