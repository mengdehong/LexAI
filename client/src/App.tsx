import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { DocumentPanel } from "./components/DocumentPanel";
import { ReadingPanel } from "./components/ReadingPanel";
import { TermsPanel } from "./components/TermsPanel";
import { ContextPanel } from "./components/ContextPanel";
import { GlobalTermbaseView } from "./components/GlobalTermbaseView";
import { SettingsView } from "./components/SettingsView";
import { OnboardingView } from "./components/OnboardingView";
import { loadConfig, type DefinitionLanguage } from "./lib/configStore";
import { useAppState } from "./state/AppState";
import "./App.css";

type BackendStatusPayload = {
  status: string;
};

function Workspace() {
  return (
    <div className="workspace">
      <div className="workspace__column">
        <DocumentPanel />
        <TermsPanel />
      </div>
      <div className="workspace__column">
        <ReadingPanel />
        <ContextPanel />
      </div>
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<string>("Connecting...");
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"workspace" | "global" | "settings">("workspace");
  const [configReady, setConfigReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [definitionLanguage, setDefinitionLanguage] = useState<DefinitionLanguage>("en");
  const [hasOnboardingMapping, setHasOnboardingMapping] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [enforceOnboarding, setEnforceOnboarding] = useState(true);
  const previousView = useRef(activeView);
  const { documentId } = useAppState();

  useEffect(() => {
    let active = true;

    const fetchStatus = async (): Promise<boolean> => {
      try {
        const raw = (await invoke<string>("fetch_backend_status")) ?? "";
        const payload: BackendStatusPayload = JSON.parse(raw);

        if (active) {
          setStatus(payload.status ?? "unknown");
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
    if (onboardingComplete === false && activeView !== "settings") {
      setEnforceOnboarding(true);
    }
  }, [activeView, onboardingComplete]);

  const showOnboarding = configReady && onboardingComplete === false && enforceOnboarding;

  const handleOnboardingComplete = () => {
    setOnboardingComplete(true);
    setEnforceOnboarding(false);
    setActiveView("global");
    refreshConfig();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>LexAI Workbench</h1>
          <p className="topbar__status">Backend status: {status}</p>
          {error && <p className="topbar__error">{error}</p>}
          {configError && <p className="topbar__error">{configError}</p>}
        </div>
        <nav className="topbar__nav">
          <button
            type="button"
            className={activeView === "workspace" ? "topbar__button active" : "topbar__button"}
            onClick={() => setActiveView("workspace")}
            disabled={showOnboarding}
          >
            Workspace
          </button>
          <button
            type="button"
            className={activeView === "global" ? "topbar__button active" : "topbar__button"}
            onClick={() => setActiveView("global")}
            disabled={showOnboarding}
          >
            Global Termbase
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "topbar__button active" : "topbar__button"}
            onClick={() => setActiveView("settings")}
            disabled={showOnboarding && activeView !== "settings"}
          >
            Settings
          </button>
        </nav>
      </header>
      <section className="app-shell__content">
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
            {activeView === "global" && <GlobalTermbaseView />}
            {activeView === "settings" && <SettingsView />}
          </>
        )}
      </section>
      <footer className="status-bar">
        <span>{documentId ? `Active document: ${documentId}` : "No document selected"}</span>
      </footer>
    </main>
  );
}

export default App;
