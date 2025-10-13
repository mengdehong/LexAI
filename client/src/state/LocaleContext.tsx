import React, { createContext, useContext } from "react";
import type { DefinitionLanguage } from "../lib/configStore";

const LocaleContext = createContext<DefinitionLanguage>("en");

type LocaleProviderProps = {
  language: DefinitionLanguage;
  children: React.ReactNode;
};

export function LocaleProvider({ language, children }: LocaleProviderProps) {
  return <LocaleContext.Provider value={language}>{children}</LocaleContext.Provider>;
}

export function useLocale(): DefinitionLanguage {
  return useContext(LocaleContext);
}
