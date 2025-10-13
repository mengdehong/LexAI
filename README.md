# LexAI Workbench

LexAI is an AI-powered terminology companion that transforms dense, domain-specific materials into personalised glossaries, definitions, and study flows. The workbench pairs a multi-provider LLM configuration hub with an expert onboarding journey so researchers, engineers, and analysts can ramp up on new knowledge spaces quickly.

## Table of Contents
- [Vision](#vision)
- [Feature Highlights](#feature-highlights)
- [Product Tour](#product-tour)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Troubleshooting & Known Issues](#troubleshooting--known-issues)

## Vision
LexAI delivers a focused alternative to general-purpose chatbots. Rather than crafting prompts from scratch, users describe their domain, proficiency, and learning goals once, and LexAI curates a starter knowledge base. Subsequent document uploads, terminology extractions, and definition refinements continuously enrich a global termbase tailored to each practitioner.

## Feature Highlights
- **Conversational Onboarding** &mdash; Guided dialogue collects user context and generates a 12-term seed glossary via configured LLM providers.
- **Global Termbase** &mdash; Search, filter, edit, deduplicate, and export terms from a centralised knowledge vault.
- **LLM Provider Hub** &mdash; Manage OpenAI, Gemini, or custom endpoints, map models to operations (term extraction, definitions, onboarding), and persist preferences.
- **Document Workbench** &mdash; Upload multi-format documents, extract terminology, capture contextual snippets, and elevate key concepts to the global base.
- **Robust Feedback** &mdash; Unified toasts, loading states, and error surfaces keep long-running operations transparent.

## Product Tour
![LexAI Onboarding Flow](docs/media/lexai-onboarding.gif)
> _Replace `docs/media/lexai-onboarding.gif` with a freshly recorded walkthrough of the Phase 4 onboarding and termbase experience._

## Tech Stack
- **Frontend:** React 19 + Vite, TypeScript, custom design system with responsive CSS.
- **Desktop Shell:** Tauri 2 with Store and Opener plugins.
- **Backend Integrations:** Python FastAPI service for document ingestion (external), SQLite via `sqlx` for the termbase.
- **LLM Providers:** OpenAI, Google Gemini, or custom HTTP-compatible APIs.

## Getting Started
### Prerequisites
- Node.js 20+
- npm 10+
- Rust stable toolchain with `cargo`, `rustfmt`, and `clippy`
- (macOS/Linux) Tauri prerequisites &mdash; install WebKitGTK on Linux if you plan to build desktop bundles

### Installation
```bash
# Install client dependencies
cd client
npm ci

# Run type-check + production build
npm run build

# Launch the Tauri desktop app in development mode
npm run tauri dev
```

## Configuration
1. Launch the app and visit **Settings**.
2. Add at least one provider with an API key:
   - Keys can be stored in the configuration store or supplied via environment variables (`VITE_OPENAI_API_KEY`, `VITE_GEMINI_API_KEY`, or `VITE_<PROVIDER_ID>_API_KEY`).
3. Map models to each operation (Term Extraction, Conversational Onboarding, AI-Assisted Definitions).
4. Pick your preferred definition language (English or Simplified Chinese).

### Conversational Onboarding
- Runs automatically on first launch when `onboardingComplete` is false.
- Collects domain, proficiency, and learning goals, then calls the mapped LLM operation `onboarding`.
- Writes unique, deduplicated terms into the SQLite store and flags onboarding as complete.
- Redirects users to the Global Termbase for immediate review.

### Global Termbase
- **Search & Filter:** Real-time fuzzy search across term names and definitions.
- **Inline Editing:** Click *Edit* to modify term/definition pairs in place and save changes via the new `update_term` command.
- **Duplicate Guard:** Saving a document term now detects existing entries and offers an update path instead of silent duplication.
- **CSV Export:** Trigger the `export_terms_csv` command to choose a destination and download a standards-compliant CSV snapshot.

## Troubleshooting & Known Issues
- API keys stored via Tauri Store remain on disk. Prefer environment variables on shared machines.
- On Linux, ensure a Secret Service or alternative credential store is available before migrating to secure key handling.
- The GitHub Actions workflow (`.github/workflows/ci.yml`) validates builds and Rust tooling; install missing system dependencies if any step fails locally.

## Roadmap
- Rich inline onboarding media and in-app explainers.
- Optional quick actions on document text selections.
- Secure, cross-platform secret storage to replace the current config-based approach.
