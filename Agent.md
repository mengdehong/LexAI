# Agent.md for LexAI

This document provides a high-level overview for AI agents to understand and interact with the LexAI project.

## Project Overview

LexAI is a sophisticated, AI-powered desktop application designed for advanced reading and terminology management. It helps users, such as translators, researchers, and technical writers, to efficiently process documents, identify key terms, and build a personal, intelligent termbase.

The application is built with Tauri, featuring a React/TypeScript frontend and a powerful hybrid backend combining Python and Rust for high-performance AI tasks.

## Goals

The project's goals are dynamic and evolve with each development phase. To determine the current goals, an agent must perform the following steps:

1.  **Identify the latest phase document**: List the contents of the `docs/versions/` directory.
2.  **Select the most recent file**: The files are named with a date suffix (e.g., `phase-11-roadmap-20251020.md`). Identify the file with the most recent date.
3.  **Read and Summarize**: Read the contents of this file and summarize its main objectives and milestones. These represent the current, active goals for the project.

## Tech Stack

- **Desktop Framework**: [Tauri](https://tauri.app/) (Rust)
- **Frontend**: [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Backend**:
    - Python for RPC server orchestration (`poetry` for dependency management).
    - Rust for performance-critical tasks (tokenization, embeddings, vector database interaction) within the RPC worker (`cargo` for dependency management).
- **AI / Data**:
    - [Qdrant](https://qdrant.tech/) for vector search.
    - Sentence Transformers (or similar) for text embeddings.
- **Database**: SQLite (managed via Tauri/SQLx).
- **Package Management**: `pnpm` (frontend), `poetry` (Python backend), `cargo` (Rust backend).

## Key Files

- **Application Entrypoint (UI)**: `client/src/App.tsx`
- **Main UI Components**:
    - `client/src/components/ReadingPanel.tsx`: The main document reading interface.
    - `client/src/components/TermsPanel.tsx`: Interface for managing identified terms.
    - `client/src/components/ContextPanel.tsx`: Shows contextual information related to selected terms.
- **Tauri Core**:
    - `client/src-tauri/src/main.rs`: The main entrypoint for the Rust backend of the desktop app.
    - `client/src-tauri/tauri.conf.json`: Configuration for the Tauri application.
- **Backend RPC Services**:
    - `backend/app/main.py`: Main entrypoint for the Python RPC server.
    - `backend/rpc_worker/src/main.rs`: Main entrypoint for the Rust-based RPC worker.
- **Core AI Logic (Rust)**:
    - `backend/rpc_worker/src/embeddings.rs`: Handles the creation of text embeddings.
    - `backend/rpc_worker/src/qdrant.rs`: Manages interaction with the Qdrant vector database.
    - `backend/rpc_worker/src/document.rs`: Logic for processing and analyzing documents.
- **Project Documentation**: The `docs/` directory contains high-level design and versioning documents.


## Agent Interactions

### Setup

1.  **Frontend**: Navigate to `client/` and run `pnpm install`.
2.  **Backend (Python)**: Navigate to `backend/` and run `poetry install`.
3.  **Backend (Rust)**: The Rust components are typically built via the Tauri command. Ensure you have a Rust toolchain installed.

### Running the Application

- To run the application in development mode, navigate to the `client/` directory and execute:
  ```bash
    npm run tauri dev
  ```

### Running Tests

- **Frontend**: In `client/`, run `npm test`.
- **Backend**: In `backend/`, run `poetry run pytest`.

### Contribution and Development Conventions

- **Primary Guidelines**: All contributions must adhere to the detailed guidelines specified in [`CONTRIBUTING.md`](./CONTRIBUTING.md). A summary of core requirements is provided below.
- **Branching Strategy**: All work must be done in typed branches (e.g., `feat/add-button`, `fix/login-bug`). The `main` branch is protected and stable.
- **Commit Messages**: Commits must follow the Conventional Commits specification (e.g., `feat(api): add new endpoint`). This is crucial for automated changelogs.
- **Phase-End Documentation**: After completing a significant development phase, a summary document must be created in `docs/versions/`.
- **Quality Assurance**: Before merging, all contributions must meet the following criteria:
  - **Code Format & Tests**: All code must be correctly formatted (`cargo fmt`) and all automated tests (`npm run test`, `cargo test`) must pass.
  - **Development Mode**: The application must start and run correctly in the `client` directory via `npm run tauri dev`.
  - **Release Build**: The application must be successfully packageable using the `npm run tauri build` command.
- **Security**: Never commit secrets or API keys to the repository.
- **Coding Style**: Follow the existing coding style (TypeScript/React for frontend, Python/Rust for backend).
- **Architectural Changes**: Update relevant documentation in the `docs/` directory when making significant architectural changes.
