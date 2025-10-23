import { invoke } from "@tauri-apps/api/core";

export async function saveApiKey(providerId: string, key: string): Promise<void> {
    const trimmed = key.trim();
    if (trimmed.length === 0) {
        console.warn("[saveApiKey] Attempted to save empty API key, skipping");
        return;
    }

    try {
        console.log(`[saveApiKey] Saving API key for provider: ${providerId} (length: ${trimmed.length})`);
        await invoke("save_api_key", { provider: providerId, key: trimmed });
        console.log(`[saveApiKey] ✓ Successfully saved API key for provider: ${providerId}`);
    } catch (error) {
        console.error(`[saveApiKey] ✗ Failed to save API key for provider '${providerId}':`, error);
        throw new Error(`Failed to save API key: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function getApiKey(providerId: string): Promise<string | null> {
    try {
        console.log(`[getApiKey] Reading API key for provider: ${providerId}`);
        const value = await invoke<string | null>("get_api_key", { provider: providerId });

        if (value === null || value === undefined) {
            console.log(`[getApiKey] No API key found for provider: ${providerId}`);
            return null;
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            const hasKey = trimmed.length > 0;
            console.log(`[getApiKey] ${hasKey ? '✓' : '✗'} API key for provider: ${providerId} (length: ${trimmed.length})`);
            return hasKey ? trimmed : null;
        }

        console.warn(`[getApiKey] Unexpected value type for provider '${providerId}':`, typeof value);
        return null;
    } catch (error) {
        console.error(`[getApiKey] ✗ Failed to read API key for provider '${providerId}':`, error);
        throw new Error(`Failed to read API key: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function hasApiKey(providerId: string): Promise<boolean> {
    try {
        const result = await invoke<boolean>("has_api_key", { provider: providerId });
        console.log(`[hasApiKey] Provider '${providerId}' has key: ${result}`);
        return result;
    } catch (error) {
        console.error(`[hasApiKey] ✗ Failed to check API key status for provider '${providerId}':`, error);
        throw new Error(`Failed to check API key: ${error instanceof Error ? error.message : String(error)}`);
    }
}
