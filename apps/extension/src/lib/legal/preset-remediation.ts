/**
 * 说明：`preset-remediation` 基础能力模块。
 *
 * 职责：
 * - 承载 `preset-remediation` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ASSISTANTS_STORAGE_KEY`、`CHAT_RUNTIME_STORAGE_KEY`、`LEGAL_PRESET_REMEDIATION_MARKER_KEY` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { clearMessagesDb } from '@/lib/chat/messages-db';
import { readBootstrapStoredJsonSeed, readStoredJson, removeStoredJson, writeStoredJson } from '@/lib/storage/json-storage';
import { isPlainRecord } from '@/lib/utils/type-guards';

/**
 * 导出常量：`ASSISTANTS_STORAGE_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const ASSISTANTS_STORAGE_KEY = 'olyq.assistants.v1';
/**
 * 导出常量：`CHAT_RUNTIME_STORAGE_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const CHAT_RUNTIME_STORAGE_KEY = 'olyq.chat.runtime.v1';
/**
 * 导出常量：`LEGAL_PRESET_REMEDIATION_MARKER_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const LEGAL_PRESET_REMEDIATION_MARKER_KEY = 'olyq.legal.preset-remediation.v1';
/**
 * 导出常量：`LEGAL_PRESET_SET`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const LEGAL_PRESET_SET = 'olyq-browser-v1';
/**
 * 导出常量：`LEGAL_ASSISTANT_SCHEMA`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const LEGAL_ASSISTANT_SCHEMA = 'browser-scenario-presets';

/**
 * 导出常量：`APPROVED_BROWSER_PRESET_GROUPS_ZH`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const APPROVED_BROWSER_PRESET_GROUPS_ZH = ['解读', '研究', '提取', '执行'] as const;
/**
 * 导出常量：`APPROVED_BROWSER_PRESET_GROUPS_EN`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const APPROVED_BROWSER_PRESET_GROUPS_EN = [
  'Briefing',
  'Research',
  'Extraction',
  'Execution',
] as const;

const BASE64_UTF8_DECODER = new TextDecoder();

/**
 * 内部函数：`decodeBase64Utf8`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function decodeBase64Utf8(value: string): string {
  const base64 = String(value || '').trim();
  if (!base64) return '';

  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return BASE64_UTF8_DECODER.decode(bytes);
  }

  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: { from: (input: string, encoding: string) => Uint8Array };
  }).Buffer;
  if (bufferCtor?.from) {
    return BASE64_UTF8_DECODER.decode(Uint8Array.from(bufferCtor.from(base64, 'base64')));
  }

  return '';
}

/**
 * 内部函数：`decodeBase64Utf8List`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function decodeBase64Utf8List(values: readonly string[]): string[] {
  return values
    .map((value) => decodeBase64Utf8(value))
    .filter(Boolean);
}

const LEGACY_DISALLOWED_SAMPLE_NAMES = new Set(decodeBase64Utf8List([
  '5Lqn5ZOB57uP55CG',
  '562W55Wl5Lqn5ZOB57uP55CG',
  '56S+576k6L+Q6JCl',
  '5YaF5a656L+Q6JCl',
  '5ZWG5a626L+Q6JCl',
  '5Lqn5ZOB6L+Q6JCl',
  '6ZSA5ZSu6L+Q6JCl',
  '55So5oi36L+Q6JCl',
  '5biC5Zy66JCl6ZSA',
  '5ZWG5Lia5pWw5o2u5YiG5p6Q',
  '6aG555uu566h55CG',
  'U0VP5LiT5a62',
  '572R56uZ6L+Q6JCl5pWw5o2u5YiG5p6Q',
  '5pWw5o2u5YiG5p6Q5biI',
  '5YmN56uv5bel56iL5biI',
  '6L+Q57u05bel56iL5biI',
  '5byA5Y+R5bel56iL5biI',
  '5rWL6K+V5bel56iL5biI',
  'SFLkurrlipvotYTmupDnrqHnkIY=',
  '6KGM5pS/',
  '6LSi5Yqh6aG+6Zeu',
  '5Yy755Sf',
  '57yW6L6R',
  '5ZOy5a2m5a62',
  '6YeH6LSt',
  '5rOV5Yqh',
  '57+76K+R5oiQ5Lit5paH',
]));

const LEGACY_PROMPT_FINGERPRINTS = decodeBase64Utf8List([
  '5L2g546w5Zyo5piv5LiA5ZCN57uP6aqM5Liw5a+M55qE5Lqn5ZOB57uP55CG',
  '5L2g546w5Zyo5piv5LiA5ZCN562W55Wl5Lqn5ZOB57uP55CG',
  '5L2g546w5Zyo5piv5LiA5ZCN56S+576k6L+Q6JCl5LiT5a62',
  '5L2g546w5Zyo5piv5LiA5ZCN5LiT5Lia55qE5YaF5a656L+Q6JCl5Lq65ZGY',
  '5L2g546w5Zyo5piv5LiA5ZCN57uP6aqM5Liw5a+M55qE5ZWG5a626L+Q6JCl5LiT5a62',
  '5L2g546w5Zyo5piv5LiA5ZCN57uP6aqM5Liw5a+M55qE5Lqn5ZOB6L+Q6JCl5LiT5a62',
  '5L2g546w5Zyo5piv5LiA5ZCN6ZSA5ZSu6L+Q6JCl57uP55CG',
  '5L2g546w5Zyo5piv5LiA5ZCN55So5oi36L+Q6JCl5LiT5a62',
  '5L2g546w5Zyo5piv5LiA5ZCN5LiT5Lia55qE5biC5Zy66JCl6ZSA5LiT5a62',
  '5L2g546w5Zyo5piv5LiA5ZCN5ZWG5Lia5pWw5o2u5YiG5p6Q5biI',
  '5L2g546w5Zyo5piv5LiA5ZCN6LWE5rex55qE6aG555uu57uP55CG',
  '5L2g546w5Zyo5piv5LiA5ZCN55+l6K+G5Liw5a+M55qEU0VP5LiT5a62',
  '5L2g546w5Zyo5piv5LiA5ZCN572R56uZ6L+Q6JCl5pWw5o2u5YiG5p6Q5biI',
  '5L2g5piv5LiA5Liq5aW955So55qE57+76K+R5Yqp5omL44CC6K+35bCG5oiR55qE6Iux5paH57+76K+R5oiQ5Lit5paH',
]);

const LEGACY_GROUP_COMBINATIONS = [
  decodeBase64Utf8List(['6IGM5Lia', '5ZWG5Lia', '5bel5YW3']),
];

/** 导出类型：`LegalPresetRemediationMarker`。 */
export type LegalPresetRemediationMarker = {
  presetSet: typeof LEGAL_PRESET_SET;
  appliedAt: number;
};

let remediationPromise: Promise<void> | null = null;

/**
 * 内部函数：`hasIndexedDbSupport`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function hasIndexedDbSupport(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * 内部函数：`normalizeStringArray`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * 内部函数：`isLegalPresetRemediationMarker`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isLegalPresetRemediationMarker(raw: unknown): raw is LegalPresetRemediationMarker {
  return (
    isPlainRecord(raw)
    && raw.presetSet === LEGAL_PRESET_SET
    && typeof raw.appliedAt === 'number'
    && Number.isFinite(raw.appliedAt)
  );
}

/**
 * 内部函数：`readRemediationMarkerSeed`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function readRemediationMarkerSeed(): LegalPresetRemediationMarker | null {
  const seed = readBootstrapStoredJsonSeed<unknown>(LEGAL_PRESET_REMEDIATION_MARKER_KEY, null, (value) => value);
  return isLegalPresetRemediationMarker(seed) ? seed : null;
}

/**
 * 内部函数：`persistRemediationMarker`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function persistRemediationMarker(marker: LegalPresetRemediationMarker) {
  await writeStoredJson(LEGAL_PRESET_REMEDIATION_MARKER_KEY, marker);
}

/**
 * 内部函数：`readStoredRemediationMarker`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function readStoredRemediationMarker(): Promise<LegalPresetRemediationMarker | null> {
  const raw = await readStoredJson<unknown>(LEGAL_PRESET_REMEDIATION_MARKER_KEY, null, (value) => value);
  if (!isLegalPresetRemediationMarker(raw)) return null;
  return raw;
}

/**
 * 内部函数：`createRemediationMarker`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createRemediationMarker(): LegalPresetRemediationMarker {
  return {
    presetSet: LEGAL_PRESET_SET,
    appliedAt: Date.now(),
  };
}

/**
 * 内部函数：`hasLegacyGroupCombination`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function hasLegacyGroupCombination(tags: string[]): boolean {
  return LEGACY_GROUP_COMBINATIONS.some((group) => group.every((item) => tags.includes(item)));
}

/**
 * 内部函数：`recordLooksLikeLegacyDisallowedPreset`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function recordLooksLikeLegacyDisallowedPreset(raw: unknown): boolean {
  if (!isPlainRecord(raw)) return false;

  const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id).trim() : '';
  if (/^\d+$/.test(id)) return true;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (LEGACY_DISALLOWED_SAMPLE_NAMES.has(name)) return true;

  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (prompt && LEGACY_PROMPT_FINGERPRINTS.some((fragment) => prompt.includes(fragment))) return true;

  const tags = normalizeStringArray(
    Array.isArray(raw.tags)
      ? raw.tags
      : (Array.isArray(raw.group) ? raw.group : []),
  );
  return hasLegacyGroupCombination(tags);
}

/**
 * 导出函数：`hasLegacyDisallowedPresetSignatures`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function hasLegacyDisallowedPresetSignatures(raw: unknown): boolean {
  if (typeof raw === 'string') {
    try {
      return hasLegacyDisallowedPresetSignatures(JSON.parse(raw) as unknown);
    } catch {
      return false;
    }
  }

  if (Array.isArray(raw)) {
    return raw.some((item) => hasLegacyDisallowedPresetSignatures(item));
  }

  if (!isPlainRecord(raw)) return false;

  if (recordLooksLikeLegacyDisallowedPreset(raw)) return true;
  if ('olyq.assistants.v1' in raw && hasLegacyDisallowedPresetSignatures(raw['olyq.assistants.v1'])) return true;
  if ('assistants' in raw && hasLegacyDisallowedPresetSignatures(raw.assistants)) return true;

  return false;
}

/**
 * 导出函数：`hasLegalPresetRemediationSeed`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function hasLegalPresetRemediationSeed(): boolean {
  return isLegalPresetRemediationMarker(readRemediationMarkerSeed());
}

/**
 * 导出函数：`ensureLegalPresetRemediation`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function ensureLegalPresetRemediation(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (remediationPromise) return remediationPromise;

  remediationPromise = (async () => {
    const existingMarker = await readStoredRemediationMarker();
    if (existingMarker) return;

    await removeStoredJson(ASSISTANTS_STORAGE_KEY);
    await removeStoredJson(CHAT_RUNTIME_STORAGE_KEY);
    if (hasIndexedDbSupport()) {
      await clearMessagesDb();
    }

    await persistRemediationMarker(createRemediationMarker());
  })();

  return remediationPromise;
}
