/**
 * Global language context for i18n.
 * Allows all modules to access current language without passing it explicitly.
 */

let currentLanguage: string = 'en';

/**
 * Set the current language for all i18n operations.
 */
export function setLanguage(lang: string): void {
  currentLanguage = normalizeLanguage(lang);
}

/**
 * Get the current language.
 */
export function getLanguage(): string {
  return currentLanguage;
}

/**
 * Normalize language code (zh-CN -> zh, en-US -> en).
 */
function normalizeLanguage(lang: string): string {
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('ko')) return 'ko';
  return 'en';
}