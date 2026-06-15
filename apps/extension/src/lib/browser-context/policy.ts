/**
 * 说明：`policy` 浏览器上下文策略模块。
 *
 * 职责：
 * - 承载标签规则、助手 override 和有效策略解析；
 * - 保持策略中心独立于 `AssistantConfig` 主结构，避免污染聊天/同步真源；
 * - 为 UI、发送链路和 preset seed 提供统一的只读/写入接口。
 *
 * 边界：
 * - 本文件只负责 `olyq.browser-context.policy.v1` 的共享存储；
 * - 不负责正文采集和 message/Port 协议。
 */
import {
  createSharedJsonConfigChannel,
} from '@/lib/storage/shared-json-config-channel';
import type { Assistant } from '@/types/assistant';
import {
  BROWSER_CONTEXT_TAG_PROFILE_MAP,
  DEFAULT_BROWSER_CONTEXT_POLICY_STATE,
  DEFAULT_BROWSER_CONTEXT_PROFILE_ID,
  findBuiltinBrowserContextProfile,
  getDefaultBrowserContextProfile,
  type BrowserContextAssistantOverride,
  type BrowserContextAssistantOverrideMode,
  type BrowserContextPolicyState,
  type BrowserContextTagRule,
  type ResolvedBrowserContextPolicy,
} from './types';
import {
  BROWSER_CONTEXT_POLICY_STORAGE_KEY,
  cloneAssistantOverride,
  clonePolicyState,
  normalizeAssistantOverride,
  normalizeBrowserContextPolicyState,
  normalizeTagRule,
} from './policy-schema';

export {
  BROWSER_CONTEXT_POLICY_STORAGE_KEY,
  normalizeBrowserContextPolicyState,
} from './policy-schema';

const BROWSER_CONTEXT_POLICY_EVENT = 'olyq:browser-context-policy-changed';

/**
 * 判断两个策略中心状态是否相同。
 *
 * @param left - 左值。
 * @param right - 右值。
 * @returns 是否一致。
 */
function isSamePolicyState(left: BrowserContextPolicyState, right: BrowserContextPolicyState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const browserContextPolicyChannel = createSharedJsonConfigChannel<BrowserContextPolicyState>({
  storageKey: BROWSER_CONTEXT_POLICY_STORAGE_KEY,
  fallback: DEFAULT_BROWSER_CONTEXT_POLICY_STATE,
  normalize: normalizeBrowserContextPolicyState,
  clone: clonePolicyState,
  isEqual: isSamePolicyState,
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'custom-event',
    eventName: BROWSER_CONTEXT_POLICY_EVENT,
  },
});

/** 获取当前策略中心快照。 */
export function getBrowserContextPolicyState(): BrowserContextPolicyState {
  return browserContextPolicyChannel.getSnapshot();
}

/**
 * 保存策略中心状态。
 *
 * @param next - 新状态。
 */
export function saveBrowserContextPolicyState(next: BrowserContextPolicyState): void {
  browserContextPolicyChannel.save(next);
}

/**
 * 订阅策略中心变化。
 *
 * @param callback - 回调。
 * @returns 取消订阅函数。
 */
export function subscribeBrowserContextPolicyChange(callback: () => void): () => void {
  return browserContextPolicyChannel.subscribe(callback);
}

/**
 * 写入单个助手 override。
 *
 * @param override - 新 override。
 */
export function upsertBrowserContextAssistantOverride(override: BrowserContextAssistantOverride): void {
  const normalized = normalizeAssistantOverride(override);
  if (!normalized) return;
  const policyState = getBrowserContextPolicyState();
  const nextOverrides = policyState.assistantOverrides.filter((item) => item.assistantId !== normalized.assistantId);
  nextOverrides.push(normalized);
  saveBrowserContextPolicyState({
    ...policyState,
    assistantOverrides: nextOverrides,
  });
}

/**
 * 删除单个助手 override。
 *
 * @param assistantId - 助手 ID。
 */
export function removeBrowserContextAssistantOverride(assistantId: string): void {
  const normalizedAssistantId = String(assistantId || '').trim();
  if (!normalizedAssistantId) return;
  const policyState = getBrowserContextPolicyState();
  saveBrowserContextPolicyState({
    ...policyState,
    assistantOverrides: policyState.assistantOverrides.filter((item) => item.assistantId !== normalizedAssistantId),
  });
}

/**
 * 删除一组助手 override。
 *
 * @param assistantIds - 助手 ID 列表。
 */
export function removeBrowserContextAssistantOverrides(assistantIds: string[]): void {
  const idSet = new Set(assistantIds.map((item) => String(item || '').trim()).filter(Boolean));
  if (idSet.size < 1) return;
  const policyState = getBrowserContextPolicyState();
  saveBrowserContextPolicyState({
    ...policyState,
    assistantOverrides: policyState.assistantOverrides.filter((item) => !idSet.has(item.assistantId)),
  });
}

/**
 * 覆盖标签规则列表。
 *
 * @param rules - 新规则列表。
 */
export function setBrowserContextTagRules(rules: BrowserContextTagRule[]): void {
  const normalizedRules = rules.map(normalizeTagRule).filter(Boolean) as BrowserContextTagRule[];
  const policyState = getBrowserContextPolicyState();
  saveBrowserContextPolicyState({
    ...policyState,
    tagRules: normalizedRules,
  });
}

/**
 * 为 preset 创建对应的助手 override seed。
 *
 * @param assistantId - 新助手 ID。
 * @param profileId - 目标 profile。
 */
export function seedBrowserContextAssistantOverride(
  assistantId: string,
  profileId: string,
): void {
  const normalizedAssistantId = String(assistantId || '').trim();
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedAssistantId || !normalizedProfileId) return;
  upsertBrowserContextAssistantOverride({
    assistantId: normalizedAssistantId,
    mode: 'profile',
    profileId: normalizedProfileId,
  });
}

/**
 * 根据标签构建一份默认规则列表。
 *
 * @param tags - 标签列表。
 * @returns 与标签对应的默认规则。
 */
export function buildDefaultBrowserContextRulesFromTags(tags: string[]): BrowserContextTagRule[] {
  const seen = new Set<string>();
  const out: BrowserContextTagRule[] = [];
  let priority = 100;
  for (const rawTag of tags) {
    const tag = String(rawTag || '').trim();
    const profileId = BROWSER_CONTEXT_TAG_PROFILE_MAP[tag];
    if (!tag || !profileId || seen.has(tag)) continue;
    seen.add(tag);
    out.push({
      id: `tag-rule:${tag}`,
      tag,
      profileId,
      priority,
      enabled: true,
    });
    priority -= 1;
  }
  return out;
}

/**
 * 获取助手 override。
 *
 * @param assistantId - 助手 ID。
 * @returns override；不存在时返回 `null`。
 */
export function getBrowserContextAssistantOverride(assistantId: string): BrowserContextAssistantOverride | null {
  const normalizedAssistantId = String(assistantId || '').trim();
  if (!normalizedAssistantId) return null;
  const override = getBrowserContextPolicyState().assistantOverrides
    .find((item) => item.assistantId === normalizedAssistantId) ?? null;
  return override ? cloneAssistantOverride(override) : null;
}

/**
 * 解析某个助手的有效策略。
 *
 * 规则：
 * - assistant custom
 * - assistant disabled
 * - assistant profile
 * - highest priority enabled tag rule
 * - default minimal-page
 *
 * @param assistant - 助手实体。
 * @returns 有效策略解析结果。
 */
export function resolveBrowserContextPolicyForAssistant(
  assistant: Pick<Assistant, 'id' | 'tags'> | null | undefined,
): ResolvedBrowserContextPolicy {
  const override = assistant ? getBrowserContextAssistantOverride(assistant.id) : null;
  if (override?.mode === 'custom' && override.customProfile) {
    return {
      profile: {
        ...override.customProfile,
        sources: [...override.customProfile.sources],
      },
      source: 'assistant-custom',
    };
  }
  if (override?.mode === 'disabled') {
    return {
      profile: getDefaultBrowserContextProfile(),
      source: 'assistant-disabled',
    };
  }
  if (override?.mode === 'profile' && override.profileId) {
    const profile = findBuiltinBrowserContextProfile(override.profileId)
      ?? findBuiltinBrowserContextProfile(DEFAULT_BROWSER_CONTEXT_PROFILE_ID)
      ?? getDefaultBrowserContextProfile();
    return {
      profile: {
        ...profile,
        sources: [...profile.sources],
      },
      source: 'assistant-profile',
    };
  }

  const tags = Array.isArray(assistant?.tags) ? assistant?.tags ?? [] : [];
  const matchedRule = getBrowserContextPolicyState().tagRules
    .filter((rule) => rule.enabled && tags.includes(rule.tag))
    .sort((left, right) => right.priority - left.priority)[0];
  if (matchedRule) {
    const profile = findBuiltinBrowserContextProfile(matchedRule.profileId)
      ?? findBuiltinBrowserContextProfile(DEFAULT_BROWSER_CONTEXT_PROFILE_ID)
      ?? getDefaultBrowserContextProfile();
    return {
      profile: {
        ...profile,
        sources: [...profile.sources],
      },
      source: 'tag-rule',
      tagRuleId: matchedRule.id,
    };
  }

  return {
    profile: getDefaultBrowserContextProfile(),
    source: 'default',
  };
}

/**
 * 返回策略区 UI 用的助手模式枚举。
 *
 * @param assistantId - 助手 ID。
 * @returns 当前 override mode。
 */
export function getBrowserContextAssistantMode(assistantId: string): BrowserContextAssistantOverrideMode {
  return getBrowserContextAssistantOverride(assistantId)?.mode ?? 'inherit';
}

void browserContextPolicyChannel.refreshFromStorage();
