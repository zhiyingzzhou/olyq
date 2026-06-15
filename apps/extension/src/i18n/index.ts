/**
 * 说明：`index` 国际化模块。
 *
 * 职责：
 * - 承载 `index` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getStoredLanguage`、`applyStoredLanguage`、`setLanguage` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  readStoredJson,
  subscribeStoredKeys,
  writeStoredJson,
} from '@/lib/storage/json-storage';
import {
  hasExtensionPageStartupStorageValue,
  LANGUAGE_STORAGE_KEY,
  readExtensionPageStartupValue,
} from '@/lib/extension/extension-page-startup';

/**
 * 语言存储 key。
 *
 * 说明：
 * - 真正的持久化真源统一走 storage adapter；
 * - localStorage 只保留 bootstrap mirror，用于扩展页首帧快速读取最近一次语言快照；
 * - 这样既能兼容扩展多上下文，又不会把语言状态拆成双真源。
 */
const STORAGE_KEY = LANGUAGE_STORAGE_KEY;
const DEFAULT_LANGUAGE = 'zh-CN';
const SUPPORTED_LANGUAGES = new Set(['zh-CN', 'en-US']);
const languageHydratedFromStartupStorage = hasExtensionPageStartupStorageValue(STORAGE_KEY);

/**
 * 归一化语言代码，避免脏值写入持久化层。
 */
export function normalizeLanguage(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return SUPPORTED_LANGUAGES.has(value) ? value : DEFAULT_LANGUAGE;
}

/**
 * 内部函数：`readPersistedLanguage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function readPersistedLanguage(): Promise<string> {
  return await readStoredJson<string>(STORAGE_KEY, DEFAULT_LANGUAGE, normalizeLanguage);
}

/**
 * 内部函数：`syncLanguageFromStorage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function syncLanguageFromStorage(): Promise<string> {
  const nextLanguage = await readPersistedLanguage();
  if (i18n.language !== nextLanguage) {
    await i18n.changeLanguage(nextLanguage);
  }
  return nextLanguage;
}

/**
 * 读取当前持久化的语言设置。
 *
 * 说明：
 * - 这里只读取 bootstrap mirror，保证 i18n 初始化时可以同步拿到最近一次语言快照；
 * - 真实值仍会在模块初始化后异步从 storage adapter 再读取一次并回填。
 *
 * @returns 当前存储的语言代码。
 */
export function getStoredLanguage(): string {
  return readExtensionPageStartupValue(STORAGE_KEY, DEFAULT_LANGUAGE, normalizeLanguage);
}

/**
 * 读取已存储语言并立即应用到 i18n 实例。
 */
export function applyStoredLanguage() {
  void syncLanguageFromStorage();
}

/**
 * 保存并切换语言。
 *
 * @param lang - 目标语言代码。
 */
export function setLanguage(lang: string) {
  const nextLanguage = normalizeLanguage(lang);
  void writeStoredJson(STORAGE_KEY, nextLanguage).catch(() => {
    // 忽略：存储失败不阻塞切换语言
  });
  void i18n.changeLanguage(nextLanguage);
}

/**
 * 获取 i18n 当前生效的语言代码。
 *
 * @returns 当前语言；若 i18n 尚未完成初始化则回退默认语言。
 */
export function getCurrentLanguage(): string {
  return i18n.language || DEFAULT_LANGUAGE;
}

/** Vite import.meta.glob 返回的 JSON 模块形态 */
type LocaleModule = {
  /** JSON 默认导出（i18next resources 的片段） */
  default: Record<string, unknown>;
};

/**
 * 判断值是否为普通对象。
 *
 * @param v - 待判断的值。
 * @returns `true` 表示是普通对象且不是数组。
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 深度合并 locale 资源对象。
 *
 * @param target - 目标对象，会被原地修改。
 * @param source - 来源对象。
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMerge(target[key] as Record<string, unknown>, value);
    } else {
      target[key] = value;
    }
  }
}

/**
 * 合并同一语言目录下的多个 locale JSON 模块。
 *
 * @param modules - `import.meta.glob` 读取到的模块映射。
 * @returns 合并后的语言资源对象。
 */
function mergeLocaleModules(modules: Record<string, LocaleModule>) {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(modules).sort()) {
    const mod = modules[key];
    deepMerge(out, mod.default ?? {});
  }
  return out;
}

const zhCN = mergeLocaleModules(
  import.meta.glob<LocaleModule>('./locales/zh-CN/**/*.json', { eager: true }) as Record<string, LocaleModule>,
);
const enUS = mergeLocaleModules(
  import.meta.glob<LocaleModule>('./locales/en-US/**/*.json', { eager: true }) as Record<string, LocaleModule>,
);

const i18nInitPromise = i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: getStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
});

/**
 * 确保当前运行时已经完成 i18n 初始化，并从统一 storage 真源同步语言。
 *
 * 说明：
 * - content script 没有 React 挂载期兜底，创建 Shadow DOM 菜单或元素选择器前必须先等待这里；
 * - 返回值是最终生效语言，调用方不得自行读取 localStorage 或写临时语言分支。
 */
let ensureI18nReadyPromise: Promise<string> | null = null;
/**
 * 确保当前运行时已经完成 i18n 初始化并同步 storage 语言。
 *
 * @returns 当前最终生效的语言代码。
 */
export async function ensureI18nReady(): Promise<string> {
  if (!ensureI18nReadyPromise) {
    ensureI18nReadyPromise = (async () => {
      await i18nInitPromise;
      return await syncLanguageFromStorage();
    })().catch((error) => {
      ensureI18nReadyPromise = null;
      throw error;
    });
  }
  return await ensureI18nReadyPromise;
}

interface GlobalThisWithI18nBinding {
  __olyqI18nStorageBoundV1__?: boolean;
}

const globalForI18n = globalThis as unknown as GlobalThisWithI18nBinding;

if (typeof window !== 'undefined' && !globalForI18n.__olyqI18nStorageBoundV1__) {
  globalForI18n.__olyqI18nStorageBoundV1__ = true;
  subscribeStoredKeys([STORAGE_KEY], () => {
    void syncLanguageFromStorage();
  });
  if (!languageHydratedFromStartupStorage) {
    void syncLanguageFromStorage().catch(() => {
      // 忽略：极端场景下 storage 不可用
    });
  }
}

export default i18n;
