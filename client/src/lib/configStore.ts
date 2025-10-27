import { LazyStore } from "@tauri-apps/plugin-store";

export type DefinitionLanguage = "en" | "zh-CN";

export type ThemeMode = "light" | "dark" | "auto";

export type ProviderVendor = "openai" | "gemini" | "custom";

export type ProviderConfig = {
    id: string;
    name: string;
    vendor: ProviderVendor;
    defaultModel: string;
    baseUrl?: string;
};

type LegacyProviderConfig = ProviderConfig & { apiKey?: string | null };

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
    themeMode: ThemeMode;
};

export type LexAIConfig = {
    providers: ProviderConfig[];
    modelMapping: ModelMapping;
    preferences: Preferences;
    onboardingComplete: boolean;
};

const DEFAULT_CONFIG: LexAIConfig = {
    providers: [
        { id: "openai", name: "OpenAI", vendor: "openai", defaultModel: "gpt-4o-mini" },
        { id: "gemini", name: "Google Gemini", vendor: "gemini", defaultModel: "gemini-1.5-flash" },
        { id: "ollama", name: "Ollama (OpenAI Compatible)", vendor: "openai", defaultModel: "llama3.1", baseUrl: "http://localhost:11434/v1" }
    ],
    modelMapping: {},
    preferences: {
        definitionLanguage: "en",
        themeMode: "auto",
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
    console.log("[configStore] Initializing store...");
    try {
        await store.init();
        console.log("[configStore] Store initialized successfully");
    } catch (error) {
        console.error("[configStore] Failed to initialize store:", error);
        throw error;
    }
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
    console.log("[configStore] loadConfig called");
    try {
        const [rawProviders, modelMapping, rawPreferences, onboardingComplete] = await Promise.all([
            readValue<LegacyProviderConfig[]>("providers", DEFAULT_CONFIG.providers),
            readValue<ModelMapping>("modelMapping", DEFAULT_CONFIG.modelMapping),
            readValue<Preferences>("preferences", DEFAULT_CONFIG.preferences),
            readValue<boolean>("onboardingComplete", DEFAULT_CONFIG.onboardingComplete),
        ]);
        console.log("[configStore] Config loaded successfully", { rawProviders, modelMapping, rawPreferences, onboardingComplete });

        const normalizedLanguage = normalizeDefinitionLanguage(rawPreferences.definitionLanguage);
        const preferences: Preferences =
            rawPreferences.definitionLanguage === normalizedLanguage
                ? rawPreferences
                : { ...rawPreferences, definitionLanguage: normalizedLanguage };

        if (preferences !== rawPreferences) {
            await savePreferences(preferences);
        }

        const providers = rawProviders.map((provider) => {
            const { apiKey: _legacyApiKey, ...rest } = provider;
            return rest;
        });

        return {
            providers,
            modelMapping,
            preferences,
            onboardingComplete,
        };
    } catch (error) {
        console.error("[configStore] Failed to load config:", error);
        throw error;
    }
}

export async function saveProviders(next: ProviderConfig[]): Promise<void> {
    const sanitized = next.map((provider) => {
        const { apiKey: _ignored, ...rest } = provider as ProviderConfig & { apiKey?: string };
        return { ...rest };
    });
    await writeValue("providers", sanitized);
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

export async function setThemeMode(themeMode: ThemeMode): Promise<void> {
    const current = await readValue<Preferences>("preferences", DEFAULT_CONFIG.preferences);
    await savePreferences({ ...current, themeMode });
}

export async function markOnboardingComplete(): Promise<void> {
    await writeValue("onboardingComplete", true);
}

export async function resetOnboardingFlag(): Promise<void> {
    await writeValue("onboardingComplete", false);
}
