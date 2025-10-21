import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import debounce from "lodash.debounce";
import { DocumentPanel } from "./components/DocumentPanel";
import { OriginalViewer } from "./components/OriginalViewer";
import { ExtractedViewer } from "./components/ExtractedViewer";
import { TermsPanel } from "./components/TermsPanel";
import { ContextPanel } from "./components/ContextPanel";
import { GlobalTermbaseView } from "./components/GlobalTermbaseView";
import { SettingsView } from "./components/SettingsView";
import { OnboardingView } from "./components/OnboardingView";
import { ReviewCenter } from "./components/ReviewCenter";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { loadConfig, type DefinitionLanguage } from "./lib/configStore";
import { useAppState } from "./state/AppState";
import { loadSessionState, saveSessionState, type SessionState, type SessionView } from "./lib/sessionStore";
import { LocaleProvider } from "./state/LocaleContext";
import "./App.css";
import { Button } from "@/components/ui/button";

type ReviewTerm = {
  id: number;
};

const SAVE_DEBOUNCE_MS = 400;

function Workspace() {
  return (
    <div className="workspace">
      <div className="workspace__column">
        <DocumentPanel />
        <OriginalViewer />
      </div>
      <div className="workspace__column">
        <ExtractedViewer />
        <TermsPanel />
        <ContextPanel />
      </div>
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<string>("Connecting...");
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"workspace" | "global" | "review" | "settings">(
    "workspace",
  );
  const [configReady, setConfigReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [definitionLanguage, setDefinitionLanguage] = useState<DefinitionLanguage>("en");
  const [hasOnboardingMapping, setHasOnboardingMapping] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [enforceOnboarding, setEnforceOnboarding] = useState(true);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [termbaseRefreshToken, setTermbaseRefreshToken] = useState(0);
  const [reviewDueCount, setReviewDueCount] = useState(0);
  const previousView = useRef(activeView);
  const { documentId, documents, terms, setTerms, hydrateDocuments } = useAppState();
  const [readingScrollPosition, setReadingScrollPosition] = useState(0);
  const contentRef = useRef<HTMLElement | null>(null);
  const latestSessionRef = useRef<SessionState | null>(null);
  const saveSession = useMemo(
    () =>
      debounce((state: SessionState) => {
        void saveSessionState(state);
      }, SAVE_DEBOUNCE_MS),
    [],
  );
  const restoreInProgress = useRef(false);

  const buildSessionSnapshot = useCallback(
    (overrides: Partial<SessionState> = {}) => {
      const activeDocument =
        documentId && documents.length ? documents.find((doc) => doc.id === documentId) ?? null : null;
      const readingPosition = overrides.readingViewScrollPosition ?? readingScrollPosition;
      const snapshot: SessionState = {
        activeView: overrides.activeView ?? activeView,
        lastOpenedDocument: overrides.lastOpenedDocument ?? activeDocument,
        documents:
          overrides.documents ??
          documents.map((doc) => ({
            id: doc.id,
            name: doc.name,
            text: doc.text,
            uploadedAt: doc.uploadedAt,
          })),
        currentExtractedTerms: overrides.currentExtractedTerms ?? terms,
        readingViewScrollPosition: readingPosition,
        onboardingCompleted: overrides.onboardingCompleted ?? onboardingComplete ?? false,
      };
      return snapshot;
    },
    [activeView, documentId, documents, onboardingComplete, readingScrollPosition, terms],
  );

  useEffect(() => {
    return () => {
      saveSession.flush();
      saveSession.cancel();
    };
  }, [saveSession]);

  useEffect(() => {
    let active = true;

    const fetchStatus = async (): Promise<boolean> => {
      try {
        const status = await invoke<string>("fetch_backend_status");

        if (active) {
          setStatus(status ?? "unknown");
          setError(null);
        }
        return true;
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message || "Unable to reach backend");
          setStatus("unavailable");
        }
        return false;
      }
    };

    const scheduleRetry = () => {
      if (!active) {
        return;
      }
      setTimeout(async () => {
        if (!active) {
          return;
        }
        const ok = await fetchStatus();
        if (!ok) {
          scheduleRetry();
        }
      }, 3000);
    };

    fetchStatus().then((ok) => {
      if (!ok) {
        scheduleRetry();
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const fetchReviewCount = async () => {
      try {
        const payload = await invoke<ReviewTerm[]>("get_review_terms", { limit: 20 });
        setReviewDueCount(payload.length);
      } catch {
        setReviewDueCount(0);
      }
    };

    fetchReviewCount();
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const saved = await loadSessionState();
      if (!active || !saved) {
        return;
      }
      restoreInProgress.current = true;
      latestSessionRef.current = saved;
      if (saved.activeView) {
        setActiveView(saved.activeView);
      }
      if (saved.documents && saved.documents.length > 0) {
        const normalizedDocs = saved.documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          text: doc.text ?? "",
          uploadedAt: doc.uploadedAt ?? Date.now(),
        }));
        hydrateDocuments(normalizedDocs, saved.lastOpenedDocument?.id ?? null);
      }
      if (saved.currentExtractedTerms) {
        setTerms(
          saved.currentExtractedTerms.map((entry) => ({
            term: entry.term,
            definition: entry.definition,
            definition_cn: entry.definition_cn ?? null,
          })),
        );
      }
      if (typeof saved.readingViewScrollPosition === "number") {
        setReadingScrollPosition(saved.readingViewScrollPosition);
      }
      restoreInProgress.current = false;
    })();

    return () => {
      active = false;
    };
  }, [hydrateDocuments, setTerms]);

  const refreshConfig = useCallback(async () => {
    try {
      const config = await loadConfig();
      setDefinitionLanguage(config.preferences.definitionLanguage);
      setHasOnboardingMapping(Boolean(config.modelMapping.onboarding));
      setOnboardingComplete(config.onboardingComplete);
      setConfigError(null);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setConfigError(detail);
      setOnboardingComplete(true);
    } finally {
      setConfigReady(true);
    }
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  useEffect(() => {
    if (previousView.current === "settings" && activeView !== "settings") {
      refreshConfig();
    }
    previousView.current = activeView;
  }, [activeView, refreshConfig]);

  useEffect(() => {
    if (restoreInProgress.current) {
      return;
    }

    const snapshot = buildSessionSnapshot();
    latestSessionRef.current = snapshot;
    saveSession(snapshot);
  }, [activeView, documentId, documents, terms, buildSessionSnapshot, saveSession]);

  const handleContentScroll = useCallback(() => {
    // Workspace handles scroll persistence.
  }, []);

  useEffect(() => {
    if (onboardingComplete === false && activeView !== "settings") {
      setEnforceOnboarding(true);
    }
  }, [activeView, onboardingComplete]);

  const showOnboarding = configReady && onboardingComplete === false && enforceOnboarding;

  useEffect(() => {
    if (showOnboarding && generatorOpen) {
      setGeneratorOpen(false);
    }
  }, [generatorOpen, showOnboarding]);

  const handleOnboardingComplete = useCallback(
    (options?: { nextView?: SessionView }) => {
      setOnboardingComplete(true);
      setEnforceOnboarding(false);
      const nextView = options?.nextView ?? activeView;
      setActiveView(nextView);
      const snapshot = buildSessionSnapshot({ onboardingCompleted: true, activeView: nextView });
      latestSessionRef.current = snapshot;
      saveSession(snapshot);
      refreshConfig();
      setTermbaseRefreshToken((token) => token + 1);
    },
    [activeView, buildSessionSnapshot, refreshConfig, saveSession],
  );

  const handleLanguagePreferenceChange = useCallback((lang: DefinitionLanguage) => {
    setDefinitionLanguage(lang);
  }, []);

  const generatorLabel = definitionLanguage === "zh-CN" ? "AI 生成术语集" : "Generate with AI";
  const reviewLabel = definitionLanguage === "zh-CN" ? "复习" : "Review";
  const reviewButtonText = reviewDueCount > 0 ? `${reviewLabel} (${reviewDueCount})` : reviewLabel;

  return (
    <LocaleProvider language={definitionLanguage}>
      <main className="app-shell">
        <header className="topbar">
          <div>
            <h1>{definitionLanguage === "zh-CN" ? "LexAI 工作台" : "LexAI Workbench"}</h1>
            <p className="topbar__status">
              {definitionLanguage === "zh-CN" ? "后端状态：" : "Backend status: "}
              {status}
            </p>
            {error && <p className="topbar__error">{error}</p>}
            {configError && <p className="topbar__error">{configError}</p>}
          </div>
          <div className="topbar__actions">
            <nav className="topbar__nav">
              <Button
                type="button"
                variant={activeView === "workspace" ? "active" : "default"}
                onClick={() => setActiveView("workspace")}
                disabled={showOnboarding || generatorOpen}
              >
                {definitionLanguage === "zh-CN" ? "工作区" : "Workspace"}
              </Button>
              <Button
                type="button"
                variant={activeView === "global" ? "active" : "default"}
                onClick={() => setActiveView("global")}
                disabled={showOnboarding || generatorOpen}
              >
                {definitionLanguage === "zh-CN" ? "全局术语库" : "Global Termbase"}
              </Button>
              <Button
                type="button"
                variant={activeView === "review" ? "active" : "default"}
                onClick={() => setActiveView("review")}
                disabled={showOnboarding || generatorOpen}
              >
                {reviewButtonText}
              </Button>
              <Button
                type="button"
                variant={activeView === "settings" ? "active" : "default"}
                onClick={() => setActiveView("settings")}
                disabled={(showOnboarding && activeView !== "settings") || generatorOpen}
              >
                {definitionLanguage === "zh-CN" ? "设置" : "Settings"}
              </Button>
            </nav>
            <div className="topbar__actions">
              <Button
                type="button"
                onClick={() => setDiagnosticsOpen(true)}
                disabled={generatorOpen}
                aria-label="Open diagnostics"
              >
                {definitionLanguage === "zh-CN" ? "诊断" : "Diagnostics"}
              </Button>
              <button
                type="button"
                className="topbar__cta"
                onClick={() => {
                  setGeneratorOpen(true);
                }}
                disabled={showOnboarding || generatorOpen}
                aria-label="Generate with AI"
              >
                {generatorLabel}
              </button>
            </div>
          </div>
        </header>
        <section className="app-shell__content" ref={contentRef} onScroll={handleContentScroll}>
          {showOnboarding ? (
            <OnboardingView
              language={definitionLanguage}
              hasOnboardingMapping={hasOnboardingMapping}
              onRequestSettings={() => {
                setEnforceOnboarding(false);
                setActiveView("settings");
              }}
              onComplete={handleOnboardingComplete}
            />
          ) : (
            <>
              {activeView === "workspace" && <Workspace />}
              {activeView === "global" && (
                <GlobalTermbaseView
                  refreshToken={termbaseRefreshToken}
                  onReviewCountChange={setReviewDueCount}
                />
              )}
              {activeView === "review" && (
                <ReviewCenter onReviewCountChange={setReviewDueCount} />
              )}
              {activeView === "settings" && (
                <SettingsView onLanguageChange={handleLanguagePreferenceChange} />
              )}
            </>
          )}
        </section>
        <footer className="status-bar">
          <span>
            {documentId
              ? definitionLanguage === "zh-CN"
                ? `当前文档：${documentId}`
                : `Active document: ${documentId}`
              : definitionLanguage === "zh-CN"
              ? "暂无选中文档"
              : "No document selected"}
          </span>
        </footer>
        {generatorOpen && (
          <div className="onboarding-modal-layer">
            <OnboardingView
              language={definitionLanguage}
              hasOnboardingMapping={hasOnboardingMapping}
              onRequestSettings={() => {
                setGeneratorOpen(false);
                setActiveView("settings");
              }}
              onComplete={(options) => {
        {diagnosticsOpen && (
          <div className="onboarding-modal-layer">
            <DiagnosticsPanel onClose={() => setDiagnosticsOpen(false)} />
          </div>
        )}
                setGeneratorOpen(false);
                if (options?.nextView) {
                  setActiveView(options.nextView);
                }
                refreshConfig();
                setTermbaseRefreshToken((token) => token + 1);
              }}
              mode="generator"
              onDismiss={() => setGeneratorOpen(false)}
            />
          </div>
        )}
      </main>
    </LocaleProvider>
  );
}

export default App;
