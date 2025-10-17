import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export async function saveApiKey(providerId: string, key: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invoke("save_api_key", { provider: providerId, key });
  } catch (error) {
    console.error("Failed to save API key", error);
    throw error;
  }
}

export async function getApiKey(providerId: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const value = await invoke<string | null>("get_api_key", { provider: providerId });
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  } catch (error) {
    console.error("Failed to read API key", error);
    throw error;
  }
}

export async function hasApiKey(providerId: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }

  try {
    return await invoke<boolean>("has_api_key", { provider: providerId });
  } catch (error) {
    console.error("Failed to check API key status", error);
    throw error;
  }
}
