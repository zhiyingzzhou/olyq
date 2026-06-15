/**
 * 说明：`translation-languages.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `translation-languages.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SELECTED_TRANSLATION_LANGUAGES,
  getTranslationLanguageDisplayLabel,
  normalizeSupportedTranslationSelection,
  normalizeSupportedTranslationLanguages,
  resolveSupportedTranslateTargetLanguage,
} from '@/lib/chat/translation-languages';

describe('translation-languages', () => {
  it('falls back to default selected languages when input is invalid', () => {
    expect(normalizeSupportedTranslationLanguages('English')).toEqual([...DEFAULT_SELECTED_TRANSLATION_LANGUAGES]);
    expect(normalizeSupportedTranslationLanguages(undefined)).toEqual([...DEFAULT_SELECTED_TRANSLATION_LANGUAGES]);
  });

  it('keeps only supported languages, removes duplicates, and sorts by catalog order', () => {
    expect(
      normalizeSupportedTranslationLanguages([
        '한국어',
        'English',
        'Not A Language',
        'English',
        '简体中文',
      ]),
    ).toEqual(['简体中文', 'English', '한국어']);
  });

  it('preserves explicit empty selection', () => {
    expect(normalizeSupportedTranslationLanguages([])).toEqual([]);
  });

  it('resolves target language from selected languages only', () => {
    expect(resolveSupportedTranslateTargetLanguage('한국어', ['简体中文', '한국어'])).toBe('한국어');
    expect(resolveSupportedTranslateTargetLanguage('Deutsch', ['简体中文', 'English'])).toBe('简体中文');
    expect(resolveSupportedTranslateTargetLanguage('', [])).toBeUndefined();
  });

  it('normalizes languages and target language through one shared helper', () => {
    expect(
      normalizeSupportedTranslationSelection({
        languages: ['한국어', 'English', 'English'],
        targetLanguage: 'Deutsch',
        fallbackLanguages: [],
      }),
    ).toEqual({
      languages: ['English', '한국어'],
      targetLanguage: 'English',
    });

    expect(
      normalizeSupportedTranslationSelection({
        languages: undefined,
        targetLanguage: undefined,
      }),
    ).toEqual({
      languages: [...DEFAULT_SELECTED_TRANSLATION_LANGUAGES],
      targetLanguage: DEFAULT_SELECTED_TRANSLATION_LANGUAGES[0],
    });
  });

  it('returns localized display labels for translation languages', () => {
    expect(getTranslationLanguageDisplayLabel('English', 'zh-CN')).toBe('英语');
    expect(getTranslationLanguageDisplayLabel('日本語', 'zh-CN')).toBe('日语');
    expect(getTranslationLanguageDisplayLabel('English', 'en-US')).toBe('English');
  });
});
