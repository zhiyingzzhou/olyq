/**
 * 说明：`translation-languages` 基础能力模块。
 *
 * 职责：
 * - 承载 `translation-languages` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TranslationLanguageOption`、`NormalizeSupportedTranslationSelectionParams`、`NormalizedSupportedTranslationSelection` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 翻译语言选项：
 * - `value`：界面展示与配置持久化时使用的标准语言名称
 * - `searchTerms`：用于搜索匹配的别名、中文名、英文名与语言代码
 */
export interface TranslationLanguageOption {
  /** 标准语言名称 */
  value: string;
  /** 当前 UI 语言下的展示标签。 */
  displayLabels: Readonly<{
    'zh-CN': string;
    'en-US': string;
  }>;
  /** 搜索别名列表（只读，避免运行时被意外修改） */
  searchTerms: readonly string[];
}

type TranslationLanguageLocale = 'zh-CN' | 'en-US';

/** 标准化“翻译语言选择”时的输入参数 */
export interface NormalizeSupportedTranslationSelectionParams {
  /** 原始语言列表输入，可能来自 storage / UI / 导入数据 */
  languages: unknown;
  /** 原始目标语言输入 */
  targetLanguage: unknown;
  /** 当输入无效时使用的兜底语言列表 */
  fallbackLanguages?: readonly string[];
}

/** 标准化后的翻译语言选择结果 */
export interface NormalizedSupportedTranslationSelection {
  /** 过滤、去重、排序后的语言列表 */
  languages: string[];
  /** 最终可用的目标语言；当列表为空时可能为 `undefined` */
  targetLanguage: string | undefined;
}

/** 内置支持的翻译语言目录 */
export const SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS: readonly TranslationLanguageOption[] = [
  { value: '简体中文', displayLabels: { 'zh-CN': '简体中文', 'en-US': 'Simplified Chinese' }, searchTerms: ['中文', '汉语', '普通话', 'chinese', 'simplified chinese', 'mandarin', 'zh', 'zh-cn'] },
  { value: '繁體中文', displayLabels: { 'zh-CN': '繁体中文', 'en-US': 'Traditional Chinese' }, searchTerms: ['繁体中文', 'traditional chinese', 'chinese traditional', 'zh-tw', 'zh-hk'] },
  { value: 'English', displayLabels: { 'zh-CN': '英语', 'en-US': 'English' }, searchTerms: ['英语', '英文', 'english', 'en'] },
  { value: '日本語', displayLabels: { 'zh-CN': '日语', 'en-US': 'Japanese' }, searchTerms: ['日语', '日文', 'japanese', 'ja'] },
  { value: '한국어', displayLabels: { 'zh-CN': '韩语', 'en-US': 'Korean' }, searchTerms: ['韩语', '朝鲜语', 'korean', 'ko'] },
  { value: 'Español', displayLabels: { 'zh-CN': '西班牙语', 'en-US': 'Spanish' }, searchTerms: ['西班牙语', 'spanish', 'es'] },
  { value: 'Français', displayLabels: { 'zh-CN': '法语', 'en-US': 'French' }, searchTerms: ['法语', 'french', 'fr'] },
  { value: 'Deutsch', displayLabels: { 'zh-CN': '德语', 'en-US': 'German' }, searchTerms: ['德语', 'german', 'de'] },
  { value: 'Português', displayLabels: { 'zh-CN': '葡萄牙语', 'en-US': 'Portuguese' }, searchTerms: ['葡萄牙语', 'portuguese', 'pt'] },
  { value: 'Português (Brasil)', displayLabels: { 'zh-CN': '巴西葡萄牙语', 'en-US': 'Brazilian Portuguese' }, searchTerms: ['巴西葡萄牙语', 'brazilian portuguese', 'portuguese brazil', 'pt-br'] },
  { value: 'Italiano', displayLabels: { 'zh-CN': '意大利语', 'en-US': 'Italian' }, searchTerms: ['意大利语', 'italian', 'it'] },
  { value: 'Nederlands', displayLabels: { 'zh-CN': '荷兰语', 'en-US': 'Dutch' }, searchTerms: ['荷兰语', 'dutch', 'nl'] },
  { value: 'Русский', displayLabels: { 'zh-CN': '俄语', 'en-US': 'Russian' }, searchTerms: ['俄语', 'russian', 'ru'] },
  { value: 'Українська', displayLabels: { 'zh-CN': '乌克兰语', 'en-US': 'Ukrainian' }, searchTerms: ['乌克兰语', 'ukrainian', 'uk'] },
  { value: 'Polski', displayLabels: { 'zh-CN': '波兰语', 'en-US': 'Polish' }, searchTerms: ['波兰语', 'polish', 'pl'] },
  { value: 'Čeština', displayLabels: { 'zh-CN': '捷克语', 'en-US': 'Czech' }, searchTerms: ['捷克语', 'czech', 'cs'] },
  { value: 'Slovenčina', displayLabels: { 'zh-CN': '斯洛伐克语', 'en-US': 'Slovak' }, searchTerms: ['斯洛伐克语', 'slovak', 'sk'] },
  { value: 'Slovenščina', displayLabels: { 'zh-CN': '斯洛文尼亚语', 'en-US': 'Slovenian' }, searchTerms: ['斯洛文尼亚语', 'slovenian', 'sl'] },
  { value: 'Hrvatski', displayLabels: { 'zh-CN': '克罗地亚语', 'en-US': 'Croatian' }, searchTerms: ['克罗地亚语', 'croatian', 'hr'] },
  { value: 'Srpski', displayLabels: { 'zh-CN': '塞尔维亚语', 'en-US': 'Serbian' }, searchTerms: ['塞尔维亚语', 'serbian latin', 'sr'] },
  { value: 'Български', displayLabels: { 'zh-CN': '保加利亚语', 'en-US': 'Bulgarian' }, searchTerms: ['保加利亚语', 'bulgarian', 'bg'] },
  { value: 'Română', displayLabels: { 'zh-CN': '罗马尼亚语', 'en-US': 'Romanian' }, searchTerms: ['罗马尼亚语', 'romanian', 'ro'] },
  { value: 'Magyar', displayLabels: { 'zh-CN': '匈牙利语', 'en-US': 'Hungarian' }, searchTerms: ['匈牙利语', 'hungarian', 'hu'] },
  { value: 'Ελληνικά', displayLabels: { 'zh-CN': '希腊语', 'en-US': 'Greek' }, searchTerms: ['希腊语', 'greek', 'el'] },
  { value: 'Türkçe', displayLabels: { 'zh-CN': '土耳其语', 'en-US': 'Turkish' }, searchTerms: ['土耳其语', 'turkish', 'tr'] },
  { value: 'العربية', displayLabels: { 'zh-CN': '阿拉伯语', 'en-US': 'Arabic' }, searchTerms: ['阿拉伯语', 'arabic', 'ar'] },
  { value: 'עברית', displayLabels: { 'zh-CN': '希伯来语', 'en-US': 'Hebrew' }, searchTerms: ['希伯来语', 'hebrew', 'he'] },
  { value: 'فارسی', displayLabels: { 'zh-CN': '波斯语', 'en-US': 'Persian' }, searchTerms: ['波斯语', 'persian', 'farsi', 'fa'] },
  { value: 'हिन्दी', displayLabels: { 'zh-CN': '印地语', 'en-US': 'Hindi' }, searchTerms: ['印地语', 'hindi', 'hi'] },
  { value: 'বাংলা', displayLabels: { 'zh-CN': '孟加拉语', 'en-US': 'Bengali' }, searchTerms: ['孟加拉语', 'bengali', 'bn'] },
  { value: 'اردو', displayLabels: { 'zh-CN': '乌尔都语', 'en-US': 'Urdu' }, searchTerms: ['乌尔都语', 'urdu', 'ur'] },
  { value: 'मराठी', displayLabels: { 'zh-CN': '马拉地语', 'en-US': 'Marathi' }, searchTerms: ['马拉地语', 'marathi', 'mr'] },
  { value: 'தமிழ்', displayLabels: { 'zh-CN': '泰米尔语', 'en-US': 'Tamil' }, searchTerms: ['泰米尔语', 'tamil', 'ta'] },
  { value: 'తెలుగు', displayLabels: { 'zh-CN': '泰卢固语', 'en-US': 'Telugu' }, searchTerms: ['泰卢固语', 'telugu', 'te'] },
  { value: 'ಕನ್ನಡ', displayLabels: { 'zh-CN': '卡纳达语', 'en-US': 'Kannada' }, searchTerms: ['卡纳达语', 'kannada', 'kn'] },
  { value: 'മലയാളം', displayLabels: { 'zh-CN': '马拉雅拉姆语', 'en-US': 'Malayalam' }, searchTerms: ['马拉雅拉姆语', 'malayalam', 'ml'] },
  { value: 'Bahasa Indonesia', displayLabels: { 'zh-CN': '印尼语', 'en-US': 'Indonesian' }, searchTerms: ['印尼语', '印度尼西亚语', 'indonesian', 'id'] },
  { value: 'Bahasa Melayu', displayLabels: { 'zh-CN': '马来语', 'en-US': 'Malay' }, searchTerms: ['马来语', 'malay', 'ms'] },
  { value: 'Tiếng Việt', displayLabels: { 'zh-CN': '越南语', 'en-US': 'Vietnamese' }, searchTerms: ['越南语', 'vietnamese', 'vi'] },
  { value: 'ไทย', displayLabels: { 'zh-CN': '泰语', 'en-US': 'Thai' }, searchTerms: ['泰语', 'thai', 'th'] },
  { value: 'Filipino', displayLabels: { 'zh-CN': '菲律宾语', 'en-US': 'Filipino' }, searchTerms: ['菲律宾语', 'tagalog', 'tl'] },
  { value: 'Svenska', displayLabels: { 'zh-CN': '瑞典语', 'en-US': 'Swedish' }, searchTerms: ['瑞典语', 'swedish', 'sv'] },
  { value: 'Dansk', displayLabels: { 'zh-CN': '丹麦语', 'en-US': 'Danish' }, searchTerms: ['丹麦语', 'danish', 'da'] },
  { value: 'Norsk', displayLabels: { 'zh-CN': '挪威语', 'en-US': 'Norwegian' }, searchTerms: ['挪威语', 'norwegian', 'no'] },
  { value: 'Suomi', displayLabels: { 'zh-CN': '芬兰语', 'en-US': 'Finnish' }, searchTerms: ['芬兰语', 'finnish', 'fi'] },
  { value: 'Eesti', displayLabels: { 'zh-CN': '爱沙尼亚语', 'en-US': 'Estonian' }, searchTerms: ['爱沙尼亚语', 'estonian', 'et'] },
  { value: 'Latviešu', displayLabels: { 'zh-CN': '拉脱维亚语', 'en-US': 'Latvian' }, searchTerms: ['拉脱维亚语', 'latvian', 'lv'] },
  { value: 'Lietuvių', displayLabels: { 'zh-CN': '立陶宛语', 'en-US': 'Lithuanian' }, searchTerms: ['立陶宛语', 'lithuanian', 'lt'] },
  { value: 'Català', displayLabels: { 'zh-CN': '加泰罗尼亚语', 'en-US': 'Catalan' }, searchTerms: ['加泰罗尼亚语', 'catalan', 'ca'] },
  { value: 'Galego', displayLabels: { 'zh-CN': '加利西亚语', 'en-US': 'Galician' }, searchTerms: ['加利西亚语', 'galician', 'gl'] },
  { value: 'Euskara', displayLabels: { 'zh-CN': '巴斯克语', 'en-US': 'Basque' }, searchTerms: ['巴斯克语', 'basque', 'eu'] },
  { value: 'ქართული', displayLabels: { 'zh-CN': '格鲁吉亚语', 'en-US': 'Georgian' }, searchTerms: ['格鲁吉亚语', 'georgian', 'ka'] },
  { value: 'Հայերեն', displayLabels: { 'zh-CN': '亚美尼亚语', 'en-US': 'Armenian' }, searchTerms: ['亚美尼亚语', 'armenian', 'hy'] },
  { value: 'Kiswahili', displayLabels: { 'zh-CN': '斯瓦希里语', 'en-US': 'Swahili' }, searchTerms: ['斯瓦希里语', 'swahili', 'sw'] },
  { value: 'Afrikaans', displayLabels: { 'zh-CN': '南非语', 'en-US': 'Afrikaans' }, searchTerms: ['南非语', 'afrikaans', 'af'] },
] as const;

/** 仅提取语言名称值，供 UI 下拉、合法性判断与默认值回填使用 */
export const SUPPORTED_TRANSLATION_LANGUAGE_VALUES: readonly string[] =
  SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS.map((option: TranslationLanguageOption): string => option.value);

/** 首次使用时默认选中的常用翻译目标语言 */
export const DEFAULT_SELECTED_TRANSLATION_LANGUAGES: readonly string[] = [
  '简体中文',
  'English',
  '日本語',
  '한국어',
  'Español',
  'Français',
] as const;

/** 默认翻译目标语言 */
export const DEFAULT_TRANSLATE_TARGET_LANGUAGE: string = 'English';

/** 语言合法性判断集合 */
const SUPPORTED_TRANSLATION_LANGUAGE_SET: ReadonlySet<string> = new Set<string>(SUPPORTED_TRANSLATION_LANGUAGE_VALUES);
/** 语言目录顺序索引条目，用于后续稳定排序 */
const SUPPORTED_TRANSLATION_LANGUAGE_INDEX_ENTRIES: readonly (readonly [string, number])[] =
  SUPPORTED_TRANSLATION_LANGUAGE_VALUES.map(
    (value: string, index: number): readonly [string, number] => [value, index],
  );
/** 语言名称到目录顺序的映射表 */
const SUPPORTED_TRANSLATION_LANGUAGE_INDEX: ReadonlyMap<string, number> =
  new Map<string, number>(SUPPORTED_TRANSLATION_LANGUAGE_INDEX_ENTRIES);

/** 语言值到目录配置的映射表。 */
const SUPPORTED_TRANSLATION_LANGUAGE_OPTION_MAP: ReadonlyMap<string, TranslationLanguageOption> =
  new Map<string, TranslationLanguageOption>(
    SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS.map((option) => [option.value, option] as const),
  );

/**
 * 内部函数：`normalizeTranslationLanguageLocale`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeTranslationLanguageLocale(locale: string | undefined): TranslationLanguageLocale {
  const normalized = String(locale || '').trim().toLowerCase();
  return normalized.startsWith('zh') ? 'zh-CN' : 'en-US';
}

/** 按当前 UI 语言返回用户可读的翻译语言标签。 */
export function getTranslationLanguageDisplayLabel(value: string, locale?: string): string {
  const option = SUPPORTED_TRANSLATION_LANGUAGE_OPTION_MAP.get(String(value || '').trim());
  if (!option) return String(value || '').trim();
  const displayLocale = normalizeTranslationLanguageLocale(locale);
  return option.displayLabels[displayLocale] || option.value;
}

/**
 * 按内置语言目录的声明顺序排序。
 * 这样即使输入顺序混乱，最终展示顺序也能保持稳定一致。
 */
function sortSupportedTranslationLanguages(values: readonly string[]): string[] {
  return [...values].sort((left: string, right: string): number => {
    const leftIndex: number = SUPPORTED_TRANSLATION_LANGUAGE_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex: number = SUPPORTED_TRANSLATION_LANGUAGE_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

/**
 * 标准化翻译语言列表：
 * - 非数组输入时回退到默认值
 * - 过滤空值与不受支持的语言
 * - 去重
 * - 按内置目录顺序排序
 */
export function normalizeSupportedTranslationLanguages(
  input: unknown,
  fallback: readonly string[] = DEFAULT_SELECTED_TRANSLATION_LANGUAGES,
): string[] {
  if (!Array.isArray(input)) return sortSupportedTranslationLanguages(fallback);

  const inputItems: readonly unknown[] = input;
  const uniq: Set<string> = new Set<string>();
  for (const item of inputItems) {
    const value: string = String(item || '').trim();
    if (!value) continue;
    if (!SUPPORTED_TRANSLATION_LANGUAGE_SET.has(value)) continue;
    uniq.add(value);
  }

  return sortSupportedTranslationLanguages([...uniq]);
}

/**
 * 在“当前可选语言列表”里解析最终目标语言。
 * 若输入目标语言无效，则回退到列表第一个元素。
 */
export function resolveSupportedTranslateTargetLanguage(input: unknown, languages: readonly string[]): string | undefined {
  const raw: string = String(input || '').trim();
  if (raw && languages.includes(raw)) return raw;
  return languages[0];
}

/**
 * 同时标准化语言列表与目标语言：
 * - 先修正语言列表
 * - 再基于修正后的列表确认目标语言
 */
export function normalizeSupportedTranslationSelection(
  params: NormalizeSupportedTranslationSelectionParams,
): NormalizedSupportedTranslationSelection {
  const languages: string[] = normalizeSupportedTranslationLanguages(
    params.languages,
    params.fallbackLanguages ?? DEFAULT_SELECTED_TRANSLATION_LANGUAGES,
  );
  const targetLanguage: string | undefined = resolveSupportedTranslateTargetLanguage(params.targetLanguage, languages);
  return { languages, targetLanguage };
}
