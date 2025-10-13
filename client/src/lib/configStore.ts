import { LazyStore } from "@tauri-apps/plugin-store";

export type DefinitionLanguage = "en" | "zh-CN";

export type ProviderVendor = "openai" | "gemini" | "custom";

export type ProviderConfig = {
  id: string;
  name: string;
  vendor: ProviderVendor;
  defaultModel: string;
  baseUrl?: string;
  apiKey?: string;
};

export type MappingEntry = {
  providerId: string;
  model: string;
};

export type ModelMapping = {
  termExtraction?: MappingEntry;
  explanation?: MappingEntry;
  onboarding?: MappingEntry;
  deepDive?: MappingEntry;
};

export type Preferences = {
  definitionLanguage: DefinitionLanguage;
};

export type LexAIConfig = {
  providers: ProviderConfig[];
  modelMapping: ModelMapping;
  preferences: Preferences;
  onboardingComplete: boolean;
};

const DEFAULT_CONFIG: LexAIConfig = {
  providers: [],
  modelMapping: {},
  preferences: {
    definitionLanguage: "en",
  },
  onboardingComplete: false,
};

function normalizeDefinitionLanguage(value: unknown): DefinitionLanguage {
  if (typeof value !== "string") {
    return "en";
  }

  const normalized = value.toLowerCase();
  if (normalized === "zh-cn" || normalized === "zh_cn" || normalized === "zh" || normalized === "zh-hans") {
    return "zh-CN";
  }

  if (normalized === "en" || normalized === "en-us" || normalized === "en_gb") {
    return "en";
  }

  return value === "zh-CN" ? "zh-CN" : "en";
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

const STORE_PATH = "lexai-config.store";
const store = new LazyStore(STORE_PATH, {
  defaults: {
    providers: DEFAULT_CONFIG.providers,
    modelMapping: DEFAULT_CONFIG.modelMapping,
    preferences: DEFAULT_CONFIG.preferences,
    onboardingComplete: DEFAULT_CONFIG.onboardingComplete,
  },
});

async function ensureLoaded() {
  await store.init();
}

async function readValue<T>(key: string, fallback: T): Promise<T> {
  await ensureLoaded();
  const value = await store.get<T>(key);
  if (value === undefined || value === null) {
    return cloneValue(fallback);
  }
  return value;
}

async function writeValue<T>(key: string, value: T): Promise<void> {
  await ensureLoaded();
  await store.set(key, cloneValue(value));
  await store.save();
}

export async function loadConfig(): Promise<LexAIConfig> {
  const [providers, modelMapping, rawPreferences, onboardingComplete] = await Promise.all([
    readValue<ProviderConfig[]>("providers", DEFAULT_CONFIG.providers),
    readValue<ModelMapping>("modelMapping", DEFAULT_CONFIG.modelMapping),
    readValue<Preferences>("preferences", DEFAULT_CONFIG.preferences),
    readValue<boolean>("onboardingComplete", DEFAULT_CONFIG.onboardingComplete),
  ]);

  const normalizedLanguage = normalizeDefinitionLanguage(rawPreferences.definitionLanguage);
  const preferences: Preferences =
    rawPreferences.definitionLanguage === normalizedLanguage
      ? rawPreferences
      : { ...rawPreferences, definitionLanguage: normalizedLanguage };

  if (preferences !== rawPreferences) {
    await savePreferences(preferences);
  }

  return {
    providers,
    modelMapping,
    preferences,
    onboardingComplete,
  };
}

export async function saveProviders(next: ProviderConfig[]): Promise<void> {
  await writeValue("providers", next);
}

export async function saveModelMapping(next: ModelMapping): Promise<void> {
  await writeValue("modelMapping", next);
}

export async function savePreferences(next: Preferences): Promise<void> {
  const normalized: Preferences = {
    ...next,
    definitionLanguage: normalizeDefinitionLanguage(next.definitionLanguage),
  };
  await writeValue("preferences", normalized);
}

export async function upsertMapping(
  operation: keyof ModelMapping,
  entry: MappingEntry | undefined,
): Promise<void> {
  const current = await readValue<ModelMapping>("modelMapping", DEFAULT_CONFIG.modelMapping);
  const next = { ...current };
  if (entry) {
    next[operation] = entry;
  } else {
    delete next[operation];
  }
  await saveModelMapping(next);
}

export async function setDefinitionLanguage(language: DefinitionLanguage): Promise<void> {
  const normalized = normalizeDefinitionLanguage(language);
  const current = await readValue<Preferences>("preferences", DEFAULT_CONFIG.preferences);
  await savePreferences({ ...current, definitionLanguage: normalized });
}

export async function markOnboardingComplete(): Promise<void> {
  await writeValue("onboardingComplete", true);
}

export async function resetOnboardingFlag(): Promise<void> {
  await writeValue("onboardingComplete", false);
}
