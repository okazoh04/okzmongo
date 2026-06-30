import { useState, ReactNode } from "react";
import { I18nContext, Locale, getMessages, tpl } from "./i18n";

const STORAGE_KEY = "okzmongo-locale";

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored) return stored;
  const lang = navigator.language;
  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return "zh-TW";
  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("ko")) return "ko";
  if (lang.startsWith("ja")) return "ja";
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = (l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: getMessages(locale), tpl }}>
      {children}
    </I18nContext.Provider>
  );
}
