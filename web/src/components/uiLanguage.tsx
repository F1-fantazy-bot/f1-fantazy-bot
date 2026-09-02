import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type UiLanguage = 'en' | 'he';
export const USER_TIME_ZONE = 'Asia/Jerusalem';

export function uiLanguageOf(value: { lang?: string } | undefined): UiLanguage {
  return value?.lang === 'he' ? 'he' : 'en';
}

export function localeFor(lang: UiLanguage): string {
  return lang === 'he' ? 'he-IL' : 'en-GB';
}

export function directionFor(lang: UiLanguage): 'rtl' | 'ltr' {
  return lang === 'he' ? 'rtl' : 'ltr';
}

type UiLanguageContextValue = {
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
};

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

export function UiLanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: UiLanguage;
  children: ReactNode;
}) {
  const [lang, setLang] = useState<UiLanguage>(initialLanguage);
  useEffect(() => {
    setLang(initialLanguage);
  }, [initialLanguage]);
  const value = useMemo(() => ({ lang, setLang }), [lang]);

  return (
    <UiLanguageContext.Provider value={value}>
      {children}
    </UiLanguageContext.Provider>
  );
}

export function useUiLanguage(): UiLanguageContextValue {
  const context = useContext(UiLanguageContext);
  if (!context) {
    // Component unit tests often render a card without the full app provider.
    // Default to English there; production trees always mount the provider.
    return { lang: 'en', setLang: () => {} };
  }
  return context;
}
