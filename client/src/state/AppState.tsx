import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type UploadedDocument = {
  id: string;
  name: string;
  uploadedAt: number;
  text: string;
};

export type TermDefinition = {
  term: string;
  definition: string;
};

type AppStateValue = {
  documentId: string | null;
  documentText: string;
  documents: UploadedDocument[];
  selectedTerm: string | null;
  terms: TermDefinition[];
  contexts: string[];
  setDocument: (payload: { id: string; text: string; name: string }) => void;
  selectDocument: (id: string) => void;
  setTerms: (terms: TermDefinition[]) => void;
  setContexts: (contexts: string[]) => void;
  setSelectedTerm: (term: string | null) => void;
  reset: () => void;
};

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState<string>("");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [terms, setTerms] = useState<TermDefinition[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);

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

  const value = useMemo<AppStateValue>(
    () => ({
      documentId,
      documentText,
      documents,
      selectedTerm,
      terms,
      contexts,
      setDocument,
      selectDocument,
      setTerms,
      setContexts,
      setSelectedTerm,
      reset,
    }),
    [
      documentId,
      documentText,
      documents,
      selectedTerm,
      terms,
      contexts,
      setDocument,
      selectDocument,
      setTerms,
      setContexts,
      setSelectedTerm,
      reset,
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
