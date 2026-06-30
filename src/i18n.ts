import { createContext, useContext } from "react";
import ja from "./locales/ja";
import en from "./locales/en";
import zhCN from "./locales/zh-CN";
import zhTW from "./locales/zh-TW";
import ko from "./locales/ko";

export type Locale = "ja" | "en" | "zh-CN" | "zh-TW" | "ko";
export type Messages = typeof ja;

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "zh-CN", label: "中文（简体）" },
  { value: "zh-TW", label: "中文（繁體）" },
  { value: "ko", label: "한국어" },
];

const dict: Record<Locale, Messages> = { ja, en, "zh-CN": zhCN, "zh-TW": zhTW, ko };

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
