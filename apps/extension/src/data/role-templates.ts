/**
 * 说明：`role-templates` 静态数据模块。
 *
 * 职责：
 * - 承载 `role-templates` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PresetLibrarySectionKey`、`AssistantPresetSection`、`buildAssistantPresetCatalogScaffold` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { normalizeAssistantIconId } from '@/lib/assistant-icons';
import type { AssistantIconId, AssistantPreset, AssistantScenario } from '@/types/assistant';
import { BUILTIN_DEFAULT_ROLE_TEMPLATE_ID } from '@/types/assistant';
import i18n from '@/i18n';
import { sanitizeMcpServerSelection } from '@/lib/mcp/selection';

/**
 * 助手预设数据（System Presets）
 *
 * 说明：
 * - 预设数据完全由扩展自身打包携带；
 * - UI 侧按当前 i18n 语言加载对应文件（zh* -\> zh，其它 -\> en）；
 * - 这些数据只作为助手预设来源，不会直接进入主聊天助手实例列表。
 *
 * 注意：浏览器端不实现本地知识库检索；角色模板仅作为 prompt 模板/角色库。
 */

/** 助手预设源数据的原始结构。 */
type AssistantPresetSourceItem = {
  /** 预设稳定 ID。 */
  id: string;
  /** 展示名称。 */
  name: string;
  /** 系统提示词。 */
  prompt: string;
  /** 可选描述。 */
  description?: string;
  /** 可选稳定图标 ID。 */
  iconId?: AssistantIconId;
  /** 可选分组列表，后续会映射为助手标签。 */
  group?: string[];
  /** 是否启用模型内置联网搜索。 */
  enableWebSearch?: boolean;
  /** MCP 服务器选择配置。 */
  mcpSelection?: unknown;
  /** 是否启用图片生成。 */
  enableGenerateImage?: boolean;
  /** 是否启用记忆。 */
  enableMemory?: boolean;
};

/** 导出类型：`PresetLibrarySectionKey`。 */
export type PresetLibrarySectionKey = 'browser' | 'general';

/** 导出类型：`AssistantPresetSection`。 */
export type AssistantPresetSection = {
  key: PresetLibrarySectionKey;
  title: string;
  categories: string[];
  presets: AssistantPreset[];
};

type AssistantPresetSectionConfig = Omit<AssistantPresetSection, 'presets'> & {
  fileName: string;
};

const BROWSER_PRESET_GROUPS_ZH = ['解读', '研究', '提取', '执行'] as const;
const BROWSER_PRESET_GROUPS_EN = ['Briefing', 'Research', 'Extraction', 'Execution'] as const;
const GENERAL_PRESET_GROUPS_ZH = ['写作', '学习', '开发', '分析', '规划', '创意', '沟通', '效率'] as const;
const GENERAL_PRESET_GROUPS_EN = [
  'Writing',
  'Learning',
  'Development',
  'Analysis',
  'Planning',
  'Creativity',
  'Communication',
  'Productivity',
] as const;

/** 统一把 CRLF 换行规范化为 LF。 */
function normalizeNewlines(text: string) {
  return String(text || '').replace(/\r\n/g, '\n');
}

/** 对字符串数组去重、去空白并保留首次顺序。 */
function uniqStrings(items: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const v = String(it || '').trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** 判断值是否为普通对象记录。 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

/**
 * 将未知 JSON 条目收敛为合法的助手预设源结构。
 *
 * 说明：
 * - 缺少 id、name 或 prompt 的条目会被整体丢弃；
 * - 这里只做静态数据清洗，不引入任何运行时默认字段。
 */
function toAssistantPresetSourceItem(raw: unknown): AssistantPresetSourceItem | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id).trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const prompt = typeof raw.prompt === 'string' ? normalizeNewlines(raw.prompt).trim() : '';
  if (!id || !name || !prompt) return null;

  const iconId = normalizeAssistantIconId(raw.iconId);
  const description = typeof raw.description === 'string' ? normalizeNewlines(raw.description).trim() : undefined;
  const groupRaw = raw.group;
  const group = Array.isArray(groupRaw) ? groupRaw.map((x) => String(x || '').trim()).filter(Boolean) : undefined;
  const enableWebSearch = typeof raw.enableWebSearch === 'boolean' ? raw.enableWebSearch : undefined;
  const enableGenerateImage = typeof raw.enableGenerateImage === 'boolean' ? raw.enableGenerateImage : undefined;
  const enableMemory = typeof raw.enableMemory === 'boolean' ? raw.enableMemory : undefined;
  const mcpSelection = 'mcpSelection' in raw ? sanitizeMcpServerSelection(raw.mcpSelection, 'auto') : undefined;

  return {
    id,
    name,
    prompt,
    ...(description ? { description } : {}),
    ...(iconId ? { iconId } : {}),
    ...(group && group.length > 0 ? { group } : {}),
    ...(typeof enableWebSearch === 'boolean' ? { enableWebSearch } : {}),
    ...(mcpSelection ? { mcpSelection } : {}),
    ...(typeof enableGenerateImage === 'boolean' ? { enableGenerateImage } : {}),
    ...(typeof enableMemory === 'boolean' ? { enableMemory } : {}),
  };
}

/**
 * 把预设源结构转换为扩展内部的 `AssistantPreset`。
 */
function sourceItemsToPresets(sourceItems: AssistantPresetSourceItem[], scenario: AssistantScenario): AssistantPreset[] {
  const out: AssistantPreset[] = [];
  for (const a of sourceItems) {
    const tags = uniqStrings(Array.isArray(a.group) ? a.group : []);
    out.push({
      id: a.id,
      scenario,
      name: a.name,
      iconId: a.iconId || undefined,
      description: a.description || undefined,
      prompt: a.prompt,
      tags: tags.length > 0 ? tags : undefined,
      enableWebSearch: typeof a.enableWebSearch === 'boolean' ? a.enableWebSearch : undefined,
      mcpSelection: a.mcpSelection ? sanitizeMcpServerSelection(a.mcpSelection, 'auto') : undefined,
      enableGenerateImage: typeof a.enableGenerateImage === 'boolean' ? a.enableGenerateImage : undefined,
      enableMemory: typeof a.enableMemory === 'boolean' ? a.enableMemory : undefined,
    });
  }
  return out;
}

/** 判断当前语言是否属于中文分支。 */
function isZhLanguage(lang: string) {
  const l = String(lang || '').toLowerCase();
  return l.startsWith('zh');
}

/**
 * 内部函数：`getAssistantPresetLocale`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getAssistantPresetLocale(lang: string): 'zh-CN' | 'en-US' {
  return isZhLanguage(lang) ? 'zh-CN' : 'en-US';
}

/**
 * 内部函数：`buildSectionConfigs`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function buildSectionConfigs(lang: string): AssistantPresetSectionConfig[] {
  if (getAssistantPresetLocale(lang) === 'zh-CN') {
    return [
      {
        key: 'browser',
        title: '浏览器场景',
        categories: [...BROWSER_PRESET_GROUPS_ZH],
        fileName: 'assistant-presets.browser.zh-CN.json',
      },
      {
        key: 'general',
        title: '通用助手',
        categories: [...GENERAL_PRESET_GROUPS_ZH],
        fileName: 'assistant-presets.general.zh-CN.json',
      },
    ];
  }

  return [
    {
      key: 'browser',
      title: 'Browser Scenarios',
      categories: [...BROWSER_PRESET_GROUPS_EN],
      fileName: 'assistant-presets.browser.en.json',
    },
    {
      key: 'general',
      title: 'General Assistants',
      categories: [...GENERAL_PRESET_GROUPS_EN],
      fileName: 'assistant-presets.general.en.json',
    },
  ];
}

/**
 * 导出函数：`buildAssistantPresetCatalogScaffold`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function buildAssistantPresetCatalogScaffold(lang: string): AssistantPresetSection[] {
  return buildSectionConfigs(lang).map((section) => ({
    key: section.key,
    title: section.title,
    categories: [...section.categories],
    presets: [],
  }));
}

/**
 * 生成角色模板源数据文件的可访问 URL。
 *
 * 说明：
 * - 扩展环境下必须使用 `chrome.runtime.getURL` 获取正确的扩展资源地址；
 * - 预览或测试环境则回退到 Vite 静态目录路径。
 */
function getPublicDataUrl(fileName: string) {
  // 扩展环境：使用 chrome.runtime.getURL，保证路径正确
  const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
  if (chromeApi?.runtime?.getURL) return chromeApi.runtime.getURL(`data/${fileName}`);
  // 网页预览/测试环境：走 Vite 静态目录
  return `/data/${fileName}`;
}

/** 按当前语言构造内置默认助手预设。 */
export function buildBuiltinDefaultAssistantPreset(lang: string): AssistantPreset {
  const locale = isZhLanguage(lang) ? 'zh-CN' : 'en-US';
  const t = i18n.getFixedT(locale);
  return {
    id: BUILTIN_DEFAULT_ROLE_TEMPLATE_ID,
    scenario: 'general',
    name: t('assistant.builtinDefault.name'),
    iconId: 'bot',
    description: t('assistant.builtinDefault.description'),
    prompt: t('assistant.builtinDefault.prompt'),
  };
}

/**
 * 内部函数：`loadPresetSection`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function loadPresetSection(config: AssistantPresetSectionConfig): Promise<AssistantPreset[]> {
  try {
    const url = getPublicDataUrl(config.fileName);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const json: unknown = await res.json().catch(() => null);
    if (!Array.isArray(json)) return [];
    const sourceItems = (json as unknown[]).map(toAssistantPresetSourceItem).filter(Boolean) as AssistantPresetSourceItem[];
    if (sourceItems.length === 0) return [];
    return sourceItemsToPresets(sourceItems, config.key);
  } catch {
    return [];
  }
}

/**
 * 内部函数：`flattenPresetCatalog`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function flattenPresetCatalog(sections: AssistantPresetSection[]): AssistantPreset[] {
  return sections.flatMap((section) => section.presets);
}

const presetCatalogCache = new Map<string, Promise<AssistantPresetSection[]>>();
const presetListCache = new Map<string, Promise<AssistantPreset[]>>();

/**
 * 内部函数：`getCacheKey`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getCacheKey(lang: string) {
  return getAssistantPresetLocale(lang);
}

/**
 * 导出函数：`resetAssistantPresetLoaderCacheForTests`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function resetAssistantPresetLoaderCacheForTests() {
  presetCatalogCache.clear();
  presetListCache.clear();
}

/**
 * 导出函数：`loadAssistantPresetCatalog`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function loadAssistantPresetCatalog(lang: string): Promise<AssistantPresetSection[]> {
  const key = getCacheKey(lang);
  const cached = presetCatalogCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    const sectionConfigs = buildSectionConfigs(lang);
    const sectionPresets = await Promise.all(sectionConfigs.map((section) => loadPresetSection(section)));
    return sectionConfigs.map((section, index) => ({
      key: section.key,
      title: section.title,
      categories: [...section.categories],
      presets: sectionPresets[index] ?? [],
    }));
  })();

  presetCatalogCache.set(key, task);
  return task;
}

/**
 * 从 `public/data/assistant-presets.*.json` 加载助手预设（异步）。
 * - 始终在结果首位插入内置“默认助手”预设；
 * - 加载失败时仅返回内置模板（不抛错，避免空列表）。
 */
export async function loadAssistantPresets(lang: string): Promise<AssistantPreset[]> {
  const builtinDefaultPreset = buildBuiltinDefaultAssistantPreset(lang);
  const key = getCacheKey(lang);
  const cached = presetListCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    try {
      const sections = await loadAssistantPresetCatalog(lang);
      const presets = flattenPresetCatalog(sections);
      if (presets.length < 1) return [builtinDefaultPreset];
      return [builtinDefaultPreset, ...presets];
    } catch {
      return [builtinDefaultPreset];
    }
  })();

  presetListCache.set(key, task);
  return task;
}
