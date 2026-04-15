import React, { createContext, useContext, useState } from 'react';
import { hr, type WaiterTranslationKeys } from './hr.js';
import { en } from './en.js';

export type Language = 'hr' | 'en';

const STORAGE_KEY = 'hk_waiter_lang';

const translations: Record<Language, WaiterTranslationKeys> = { hr, en };

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'hr' || stored === 'en') return stored;
  return 'hr'; // default Croatian for staff
}

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: WaiterTranslationKeys;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);

  function setLang(newLang: Language) {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
