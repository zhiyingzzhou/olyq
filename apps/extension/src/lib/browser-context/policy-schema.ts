/**
 * 说明：`policy-schema` 浏览器上下文策略契约模块。
 *
 * 职责：
 * - 定义 `olyq.browser-context.policy.v1` 的当前 v1 schema；
 * - 提供标签规则、助手 override 与自定义 profile 的无副作用规整函数；
 * - 让运行时策略模块和 Data Contract Registry 共享同一份结构真源。
 *
 * 边界：
 * - 本文件不创建 shared-json channel，不读取助手树；
 * - 策略解析、写入和订阅仍由 `policy.ts` 承担。
 */
import {
  DEFAULT_BROWSER_CONTEXT_POLICY_STATE,
  type BrowserContextAssistantOverride,
  type BrowserContextPolicyState,
  type BrowserContextProfile,
  type BrowserContextTagRule,
} from './types';

/** 浏览器上下文策略中心的存储键。 */
export const BROWSER_CONTEXT_POLICY_STORAGE_KEY = 'olyq.browser-context.policy.v1';

/**
 * 克隆标签规则。
 *
 * @param rule - 输入规则。
 * @returns 克隆后的规则。
 */
export function cloneTagRule(rule: BrowserContextTagRule): BrowserContextTagRule {
  return { ...rule };
}

/**
 * 克隆助手 override。
 *
 * @param override - 输入 override。
 * @returns 克隆后的 override。
 */
export function cloneAssistantOverride(override: BrowserContextAssistantOverride): BrowserContextAssistantOverride {
  return {
    ...override,
    customProfile: override.customProfile
      ? {
          ...override.customProfile,
          sources: [...override.customProfile.sources],
        }
      : undefined,
  };
}

/**
 * 克隆整个策略中心状态。
 *
 * @param state - 输入状态。
 * @returns 克隆结果。
 */
export function clonePolicyState(state: BrowserContextPolicyState): BrowserContextPolicyState {
  return {
    tagRules: state.tagRules.map(cloneTagRule),
    assistantOverrides: state.assistantOverrides.map(cloneAssistantOverride),
  };
}

/**
 * 归一化标签规则。
 *
 * @param raw - 原始输入。
 * @returns 合法规则；非法时返回 `null`。
 */
export function normalizeTagRule(raw: unknown): BrowserContextTagRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const tag = typeof rec.tag === 'string' ? rec.tag.trim() : '';
  const profileId = typeof rec.profileId === 'string' ? rec.profileId.trim() : '';
  if (!id || !tag || !profileId) return null;
  return {
    id,
    tag,
    profileId,
    priority: typeof rec.priority === 'number' && Number.isFinite(rec.priority) ? rec.priority : 0,
    enabled: typeof rec.enabled === 'boolean' ? rec.enabled : true,
  };
}

/**
 * 归一化 profile。
 *
 * @param raw - 原始输入。
 * @returns 合法 profile；非法时返回 `null`。
 */
function normalizeCustomProfile(raw: unknown): BrowserContextProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const title = typeof rec.title === 'string' ? rec.title.trim() : '';
  const description = typeof rec.description === 'string' ? rec.description.trim() : '';
  const outputFormat = rec.outputFormat === 'markdown' || rec.outputFormat === 'json' ? rec.outputFormat : 'text';
  const sources = Array.isArray(rec.sources)
    ? rec.sources.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!id || !title || sources.length < 1) return null;
  return {
    id,
    title,
    description,
    outputFormat,
    sources: sources as BrowserContextProfile['sources'],
    maxPromptChars: typeof rec.maxPromptChars === 'number' && Number.isFinite(rec.maxPromptChars)
      ? Math.max(200, Math.floor(rec.maxPromptChars))
      : 2400,
    cacheTtlMs: typeof rec.cacheTtlMs === 'number' && Number.isFinite(rec.cacheTtlMs)
      ? Math.max(5_000, Math.floor(rec.cacheTtlMs))
      : 60_000,
  };
}

/**
 * 归一化助手 override。
 *
 * @param raw - 原始输入。
 * @returns 合法 override；非法时返回 `null`。
 */
export function normalizeAssistantOverride(raw: unknown): BrowserContextAssistantOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const assistantId = typeof rec.assistantId === 'string' ? rec.assistantId.trim() : '';
  const mode = rec.mode === 'disabled' || rec.mode === 'profile' || rec.mode === 'custom' ? rec.mode : 'inherit';
  if (!assistantId) return null;
  const profileId = typeof rec.profileId === 'string' ? rec.profileId.trim() : undefined;
  const customProfile = normalizeCustomProfile(rec.customProfile);
  return {
    assistantId,
    mode,
    ...(profileId ? { profileId } : {}),
    ...(customProfile ? { customProfile } : {}),
  };
}

/**
 * 归一化策略中心状态。
 *
 * @param raw - 原始输入。
 * @returns 规范化后的状态。
 */
export function normalizeBrowserContextPolicyState(raw: unknown): BrowserContextPolicyState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clonePolicyState(DEFAULT_BROWSER_CONTEXT_POLICY_STATE);
  const rec = raw as Record<string, unknown>;
  const tagRules = Array.isArray(rec.tagRules)
    ? rec.tagRules.map(normalizeTagRule).filter(Boolean) as BrowserContextTagRule[]
    : [];
  const assistantOverrides = Array.isArray(rec.assistantOverrides)
    ? rec.assistantOverrides.map(normalizeAssistantOverride).filter(Boolean) as BrowserContextAssistantOverride[]
    : [];
  return {
    tagRules,
    assistantOverrides,
  };
}
