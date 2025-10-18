# LexAI Configuration Guide

This document walks through everything you need to provision LexAI v0.1.2: registering providers, storing API keys securely, mapping models to features, and tuning the review loop. It complements the high-level overview in [`README.md`](README.md).

## Table of Contents

- [Supported Providers](#supported-providers)
- [Prerequisites](#prerequisites)
- [Adding a Provider](#adding-a-provider)
- [Secure Storage Options](#secure-storage-options)
- [Mapping Models to Features](#mapping-models-to-features)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)

## Supported Providers

LexAI ships with first-class support for:

| Vendor        | Default Base URL                       | Notes |
| ------------- | -------------------------------------- | ----- |
| OpenAI        | `https://api.openai.com/v1`            | Compatible with GPT-4o, GPT-4o-mini, GPT-3.5 variants |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | Supports Gemini 1.5 (Pro/Flash) and Gemini 1.0 |
| Custom        | User-supplied                          | Provide a fully compatible OpenAI-style endpoint |

You can add additional providers by setting a unique identifier (`id`), display name, and base URL.

## Prerequisites

Before launching the desktop app:

1. Gather API keys for the providers you plan to use.
2. Decide whether to store keys securely (Stronghold) or inject them at runtime via environment variables.
3. Ensure the provider has sufficient quota and the required models are enabled for your account.

## Adding a Provider

1. Launch LexAI and open the **Settings ➜ AI Providers** panel.
2. Click **Add Provider** (or edit an existing entry) and fill in:
   - **Name** – Display label in the UI.
   - **Vendor** – OpenAI, Gemini, or Custom.
   - **Default Model** – Used when a mapping hasn’t been set.
   - **Base URL** – Optional override. Leave blank to use the vendor default.
   - **API Key** – Paste the provider key if you want it stored securely (see below).
3. Save the provider. LexAI will automatically assign it to unmapped features.

## Secure Storage Options

LexAI v0.1.1 stores credentials in a **Stronghold** vault (`stronghold.scout`) located in your OS application data directory:

- Keys saved through the UI are encrypted at rest. Migrating from earlier releases happens automatically on launch.
- Clearing the “Remove stored API key” checkbox in the Settings form deletes the vault entry while preserving the provider configuration.
- If you prefer ephemeral keys, leave the API Key field blank and rely on environment variables instead (see next section).

### Resetting the Vault

Delete the `stronghold.scout` file and restart LexAI. You will be prompted to re-enter provider keys. This is safe to do if you suspect corruption or wish to rotate credentials.

## Mapping Models to Features

Each feature uses a named operation that can point to a different provider/model pair:

| Feature                      | Operation Key       | Typical Model Examples |
| --------------------------- | ------------------- | ---------------------- |
| Document Term Extraction    | `termExtraction`    | GPT-4o-mini, Gemini Flash |
| Conversational Onboarding   | `onboarding`        | GPT-4o, Claude 3 Sonnet (custom endpoint) |
| AI-Assisted Definitions     | `explanation`       | GPT-4o, Gemini Pro |
| Deep Dive (Term Expansion)  | `deepDive`          | GPT-4o, Gemini Pro |

1. In **Settings ➜ Function-to-Model Mapping**, choose the provider for each operation.
2. Optionally override the model name per operation. Leaving the field blank falls back to the provider’s default model.
3. Model changes are saved when the input loses focus.

## Environment Variables Reference

Environment variables are resolved after Stronghold and are useful for CI/CD, shared environments, or when you do not want to persist credentials locally.

| Variable Pattern                    | Description |
| ---------------------------------- | ----------- |
| `VITE_OPENAI_API_KEY`              | OpenAI-specific default |
| `VITE_GEMINI_API_KEY`              | Gemini-specific default |
| `VITE_<PROVIDER_ID>_API_KEY`       | Provider ID converted to uppercase snake case (e.g. `lexai-openai` → `VITE_LEXAI_OPENAI_API_KEY`) |
| `VITE_<PROVIDER_NAME>_API_KEY`     | Provider display name converted similarly (fallback if ID differs) |

To use environment variables:

```bash
# macOS / Linux
export VITE_OPENAI_API_KEY="sk-..."

# Windows PowerShell
$Env:VITE_OPENAI_API_KEY = "sk-..."

npm run tauri dev
```

Environment variables take precedence only when no Stronghold entry is found.

## Troubleshooting

- **Provider not appearing in mappings:** Ensure the provider ID is unique and saved successfully.
- **Stronghold snapshot missing:** The vault is created automatically when the first key is saved. Confirm the application has permissions to write to the app-data directory.
- **LLM call fails with 401:** Regenerate the API key, save it again in Settings, and re-run the operation.
- **Model name rejected:** Confirm you are using the provider’s canonical model identifier (e.g. `gpt-4o-mini`, `gemini-1.5-pro-latest`).

For additional help, open an issue with provider logs redacted. Happy learning!
