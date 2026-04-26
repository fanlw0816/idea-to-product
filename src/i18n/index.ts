/**
 * Simple i18n translation utility.
 * Supports nested keys and template parameters.
 */

import { getLanguage } from './context.js';

// Type for translation dictionaries
interface TranslationDict {
  [key: string]: string | TranslationDict;
}

// Import translations synchronously
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

const translations: Record<string, TranslationDict> = {
  en: en as TranslationDict,
  zh: zh as TranslationDict,
  ja: ja as TranslationDict,
  ko: ko as TranslationDict,
};

/**
 * Get a nested value from a translation dict using dot-separated key.
 * Example: getValue(translations.zh, 'phase.idea.start') -> "启动创意竞技场..."
 */
function getValue(dict: TranslationDict, key: string): string | undefined {
  const parts = key.split('.');
  let current: TranslationDict | string = dict;

  for (const part of parts) {
    if (typeof current === 'string') return undefined;
    current = current[part];
    if (current === undefined) return undefined;
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace template parameters in a string.
 * Example: replaceParams("创建了 {count} 个文件", { count: 5 }) -> "创建了 5 个文件"
 */
function replaceParams(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

/**
 * Translate a key to the current language.
 * Falls back to English if the key is not found in the current language.
 *
 * @param key - Dot-separated translation key (e.g., 'phase.idea.start')
 * @param params - Optional template parameters (e.g., { count: 5 })
 * @returns Translated string with parameters replaced
 */
export function t(key: string, params?: Record<string, unknown>): string {
  const lang = getLanguage();

  // Try current language first
  let value = getValue(translations[lang] || translations.en, key);

  // Fallback to English if not found
  if (value === undefined && lang !== 'en') {
    value = getValue(translations.en, key);
  }

  // Return key if translation not found
  if (value === undefined) {
    return key;
  }

  return replaceParams(value, params);
}

/**
 * Translate with explicit language (bypasses global context).
 */
export function tWithLang(key: string, lang: string, params?: Record<string, unknown>): string {
  let value = getValue(translations[lang] || translations.en, key);

  if (value === undefined && lang !== 'en') {
    value = getValue(translations.en, key);
  }

  if (value === undefined) {
    return key;
  }

  return replaceParams(value, params);
}