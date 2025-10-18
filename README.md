# LexAI Workbench · v0.1.1

LexAI is a desktop workbench for rapidly building domain glossaries, contextual definitions, and review loops with the help of modern LLMs. The v0.1.0 release focuses on shippable quality: secure credential management, reproducible builds, and the test coverage required to sustain the Phase 6 feature set.

## Contents

- [Why LexAI?](#why-lexai)
- [Key Capabilities](#key-capabilities)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Testing & Quality Gates](#testing--quality-gates)
- [Secure Credential Storage](#secure-credential-storage)
- [Building Release Packages](#building-release-packages)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

## Why LexAI?

Traditional chat interfaces require carefully crafted prompts and deliver ephemeral answers. LexAI keeps the learning artefacts that matter—seed glossaries, contextual snippets, and review progress—in a durable desktop workspace that you fully control. Configure providers once, extract terminology repeatedly, and refine a global termbase that travels with you across projects.

## Key Capabilities

- **Conversational Onboarding** – Collect a learner’s domain, proficiency level, and goals, then auto-generate a starter glossary with your preferred LLM provider.
- **Secure Credential Vault** – API keys are stored in an encrypted Stronghold snapshot managed by Tauri. Legacy plaintext keys are migrated automatically.
- **Document Workbench** – Upload source materials, extract high-impact terminology, and capture contextual references for later review.
- **Global Termbase & Review Loop** – Edit, deduplicate, export, and schedule spaced reviews with stage tracking.
- **Multi-Provider Hub** – Map OpenAI, Google Gemini, or custom-compatible endpoints to extraction, explanation, onboarding, and deep-dive operations.

*A refreshed GIF walkthrough (Onboarding → Termbase → Review) ships alongside the GitHub release assets.*

## Quick Start

### 1. Install prerequisites

- Node.js **20+** and npm **10+**
- Rust toolchain (`rustup`, `cargo`, `rustfmt`)
- Platform prerequisites for Tauri 2 (see [official checklist](https://tauri.app/v2/guides/prerequisites))

### 2. Install dependencies & launch the desktop shell

```bash
git clone https://github.com/<your-org>/lexai.git
cd lexai/client
npm ci

# Run type-check + production build
npm run build

# Launch Tauri dev shell
npm run tauri dev
```

The first launch walks you through conversational onboarding before unlocking the workspace and review centre.

## Configuration

- Start the desktop app and open **Settings** to register providers, map models, and adjust language preferences.
- Refer to **[CONFIGURING.md](CONFIGURING.md)** for detailed steps covering:
  - Provider prerequisites and recommended models
  - Secure API key storage vs. environment variables
  - Migrating legacy plaintext keys into Stronghold
  - Custom endpoints, rate-limit considerations, and reviewer tips

## Testing & Quality Gates

This repository ships with frontend and backend tests that must pass before release:

```bash
# Frontend unit tests (prompt builder + terminology tooling)
cd client
npm run test

# Tauri integration tests (Stronghold + SRS review engine)
cd ../client/src-tauri
cargo test
```

CI (`.github/workflows/ci.yml`) runs the same commands on every push. Covering both layers guards against prompt regressions and Stronghold storage issues.

## Secure Credential Storage

LexAI v0.1.1 replaces config-store secrets with **encrypted Stronghold snapshots**:

- Keys saved through the UI are persisted in `stronghold.scout` under your OS app-data directory.
- On startup, any legacy plaintext key in `lexai-config.store` is migrated into Stronghold and then removed.
- The encryption master key is derived with Blake3; future releases will let you rotate or supply a custom password.
- The helper module `client/src/lib/apiKeys.ts` resolves keys for runtime use, falling back to environment variables when no vault entry exists.

Visit [CONFIGURING.md](CONFIGURING.md#secure-storage-options) for migration advice and environment-variable mappings (`VITE_OPENAI_API_KEY`, `VITE_GEMINI_API_KEY`, `VITE_<PROVIDER_ID>_API_KEY`, …).

## Building Release Packages

LexAI ships as a Tauri desktop application for macOS (Intel & Apple Silicon), Windows, and Linux. Two build paths are available:

1. **Local:**
   ```bash
   cd client
   npm run tauri build
   ```
   Bundles appear in `client/src-tauri/target/release/bundle/`.

2. **Automated:**
   `.github/workflows/release.yml` runs on every `v*` tag push, building and uploading signed artifacts to the corresponding GitHub Release.

## Troubleshooting

- **Missing dependencies:** re-run `npm ci` inside `client/` and confirm Rust toolchain is installed.
- **LLM call failures:** verify provider credentials in Settings, or override via environment variables before launch.
- **Stronghold snapshot issues:** delete `stronghold.scout` to reset the vault (you will need to re-save keys).
- **CSV export blocked:** grant filesystem permissions when requested by the OS-native dialog.

## Roadmap

- Guided configuration for additional LLM providers
- Inline review heatmaps and spaced-repetition analytics
- Stronghold master-password UX and multi-device secret sync

Have ideas? Open a discussion or issue in the GitHub repository—LexAI’s first public preview thrives on community feedback.
