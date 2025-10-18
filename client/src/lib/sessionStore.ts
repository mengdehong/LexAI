import { LazyStore } from "@tauri-apps/plugin-store";

export type SessionView = "workspace" | "global" | "review" | "settings";

export type SessionTerm = {
  term: string;
  definition: string;
  definition_cn?: string | null;
};

export type SessionDocument = {
  id: string;
  name: string;
  text?: string;
  uploadedAt?: number;
};

export type SessionState = {
  activeView: SessionView;
  lastOpenedDocument?: SessionDocument | null;
  documents?: SessionDocument[];
  currentExtractedTerms?: SessionTerm[];
  readingViewScrollPosition?: number;
  onboardingCompleted?: boolean;
};

const SESSION_STORE_PATH = "lexai-session.store";

const sessionStore = new LazyStore(SESSION_STORE_PATH, {
  defaults: {
    session: null as SessionState | null,
  },
});

async function ensureLoaded() {
  await sessionStore.init();
}

async function readRawState(): Promise<SessionState | null> {
  await ensureLoaded();
  const value = await sessionStore.get<SessionState | null>("session");
  return value ?? null;
}

async function writeState(next: SessionState | null): Promise<void> {
  await ensureLoaded();
  await sessionStore.set("session", next);
  await sessionStore.save();
}

const DEFAULT_SESSION_STATE: SessionState = {
  activeView: "workspace",
  lastOpenedDocument: null,
  documents: [],
  currentExtractedTerms: [],
  readingViewScrollPosition: 0,
  onboardingCompleted: false,
};

export async function loadSessionState(): Promise<SessionState | null> {
  const state = await readRawState();
  if (!state) {
    return null;
  }

  return {
    ...DEFAULT_SESSION_STATE,
    ...state,
    documents: state.documents ?? DEFAULT_SESSION_STATE.documents,
    currentExtractedTerms: state.currentExtractedTerms ?? DEFAULT_SESSION_STATE.currentExtractedTerms,
    lastOpenedDocument:
      state.lastOpenedDocument === undefined
        ? DEFAULT_SESSION_STATE.lastOpenedDocument
        : state.lastOpenedDocument,
    onboardingCompleted:
      state.onboardingCompleted === undefined
        ? DEFAULT_SESSION_STATE.onboardingCompleted
        : state.onboardingCompleted,
  };
}

export async function saveSessionState(update: SessionState | Partial<SessionState>): Promise<void> {
  const current = (await readRawState()) ?? DEFAULT_SESSION_STATE;
  const next: SessionState = {
    ...current,
    ...update,
    documents: update.documents ?? current.documents,
    currentExtractedTerms: update.currentExtractedTerms ?? current.currentExtractedTerms,
    lastOpenedDocument:
      update.lastOpenedDocument === undefined ? current.lastOpenedDocument ?? null : update.lastOpenedDocument,
    onboardingCompleted:
      update.onboardingCompleted === undefined ? current.onboardingCompleted ?? false : update.onboardingCompleted,
  };
  await writeState(next);
}

export async function overwriteSessionState(next: SessionState | null): Promise<void> {
  if (next === null) {
    await writeState(null);
    return;
  }
  await writeState({
    ...DEFAULT_SESSION_STATE,
    ...next,
  });
}

export async function resetSessionState(): Promise<void> {
  await writeState(null);
}
