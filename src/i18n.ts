import { createContext, useContext } from "react";
import ja from "./locales/ja";
import en from "./locales/en";
import zhCN from "./locales/zh-CN";
import zhTW from "./locales/zh-TW";
import ko from "./locales/ko";
import ru from "./locales/ru";
import kk from "./locales/kk";
import es from "./locales/es";
import pt from "./locales/pt";
import fr from "./locales/fr";
import de from "./locales/de";
import it from "./locales/it";
import nl from "./locales/nl";
import sv from "./locales/sv";
import no from "./locales/no";
import ar from "./locales/ar";
import th from "./locales/th";
import vi from "./locales/vi";

export type Locale =
  | "ja" | "en" | "zh-CN" | "zh-TW" | "ko" | "ru" | "kk" | "es" | "pt"
  | "fr" | "de" | "it" | "nl" | "sv" | "no" | "ar" | "th" | "vi";
export type Messages = typeof ja;

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "zh-CN", label: "中文（简体）" },
  { value: "zh-TW", label: "中文（繁體）" },
  { value: "ko", label: "한국어" },
  { value: "ru", label: "Русский" },
  { value: "kk", label: "Қазақша" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
  { value: "sv", label: "Svenska" },
  { value: "no", label: "Norsk" },
  { value: "ar", label: "العربية" },
  { value: "th", label: "ไทย" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

const dict: Record<Locale, Messages> = {
  ja, en, "zh-CN": zhCN, "zh-TW": zhTW, ko, ru, kk, es, pt, fr, de, it, nl, sv, no, ar, th, vi,
};

export function getMessages(locale: Locale): Messages {
  return dict[locale];
}

export function tpl(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Messages;
  tpl: typeof tpl;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: "ja",
  setLocale: () => {},
  t: ja,
  tpl,
});

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
