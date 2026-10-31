"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

import { translate, type Locale, type MessageKey } from "./messages";

const LocaleContext = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

export function useT() {
  const locale = useContext(LocaleContext);
  return useCallback((key: MessageKey) => translate(locale, key), [locale]);
}
