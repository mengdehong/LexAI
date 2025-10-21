import { invoke } from "@tauri-apps/api/tauri";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type UploadedDocument = {
  id: string;
  name: string;
  uploadedAt: number;
  text: string;
};

export type TermDefinition = {
  term: string;
  definition: string;
  definition_cn?: string | null;
};

type GlobalTerm = {
  id: number;
  term: string;
  definition: string;
  definition_cn: string | null;
};

type AppStateValue = {
  documentId: string | null;
  documentText: string;
  documents: UploadedDocument[];
  selectedTerm: string | null;
  terms: TermDefinition[];
  contexts: string[];
  globalTerms: GlobalTerm[];
  setDocument: (payload: { id: string; text: string; name: string }) => void;
  selectDocument: (id: string) => void;
  removeDocument: (id: string) => void;
  setTerms: (terms: TermDefinition[]) => void;
  setContexts: (contexts: string[]) => void;
  setSelectedTerm: (term: string | null) => void;
  refreshGlobalTerms: () => Promise<void>;
  reset: () => void;
  hydrateDocuments: (entries: UploadedDocument[], activeId: string | null) => void;
};

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState<string>("");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [terms, setTerms] = useState<TermDefinition[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);
  const [globalTerms, setGlobalTerms] = useState<GlobalTerm[]>([]);

  const refreshGlobalTerms = useCallback(async () => {
    try {
      const payload = await invoke<GlobalTerm[]>("get_all_terms");
      setGlobalTerms(payload);
    } catch (err) {
      console.error("Failed to refresh global terms", err);
    }
  }, []);

  useEffect(() => {
    refreshGlobalTerms();
  }, [refreshGlobalTerms]);

  const reset = useCallback(() => {
    setDocumentId(null);
    setDocumentText("");
    setSelectedTerm(null);
    setTerms([]);
    setContexts([]);
  }, [setContexts, setDocumentId, setDocumentText, setSelectedTerm, setTerms]);

  const activateDocument = useCallback(
    (doc: UploadedDocument | null) => {
      if (!doc) {
        reset();
        return;
      }

      setDocumentId(doc.id);
      setDocumentText(doc.text);
      setSelectedTerm(null);
      setTerms([]);
      setContexts([]);
    },
    [reset, setContexts, setDocumentId, setDocumentText, setSelectedTerm, setTerms],
  );

  const removeDocument = useCallback(
    (id: string) => {
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      if (documentId === id) {
        reset();
      }
    },
    [documentId, reset],
  );

  const setDocument = useCallback(
    ({ id, text, name }: { id: string; text: string; name: string }) => {
      const next: UploadedDocument = {
        id,
        name,
        text,
        uploadedAt: Date.now(),
      };

      activateDocument(next);

      setDocuments((prev) => [next, ...prev.filter((doc) => doc.id !== id)]);
    },
    [activateDocument, setDocuments],
  );

  const selectDocument = useCallback(
    (id: string) => {
      const found = documents.find((doc) => doc.id === id);
      if (!found) {
        return;
      }

      activateDocument(found);
      setDocuments((prev) => [found, ...prev.filter((doc) => doc.id !== id)]);
    },
    [activateDocument, documents, setDocuments],
  );

  const hydrateDocuments = useCallback(
    (entries: UploadedDocument[], activeId: string | null) => {
      setDocuments(entries);
      if (!activeId) {
        reset();
        return;
      }
      const active = entries.find((doc) => doc.id === activeId) ?? null;
      activateDocument(active);
    },
    [activateDocument, reset, setDocuments],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      documentId,
      documentText,
      documents,
      selectedTerm,
      terms,
      contexts,
      globalTerms,
      setDocument,
      selectDocument,
      removeDocument,
      setTerms,
      setContexts,
      setSelectedTerm,
      refreshGlobalTerms,
      reset,
      hydrateDocuments,
    }),
    [
      documentId,
      documentText,
      documents,
      selectedTerm,
      terms,
      contexts,
      globalTerms,
      setDocument,
      selectDocument,
      setTerms,
      setContexts,
      setSelectedTerm,
      refreshGlobalTerms,
      reset,
      hydrateDocuments,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return ctx;
}
