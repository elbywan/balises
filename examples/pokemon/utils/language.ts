/**
 * Language constants and helper functions for i18n support
 */

export interface Language {
  code: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh-Hans", label: "中文" },
];

/**
 * Get default language from browser, falling back to English
 */
export function getDefaultLanguage(): string {
  const saved = localStorage.getItem("pokemon-language");
  if (saved) return saved;

  // Check browser language
  const browserLang = navigator.language.split("-")[0]; // "fr-FR" -> "fr"
  const supported = LANGUAGES.find((l) => l.code === browserLang);
  return supported ? supported.code : "en";
}
