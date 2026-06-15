/**
 * 说明：`effective-state` 浏览器上下文生效态解析模块。
 *
 * 职责：
 * - 把总开关、会话模式、assistant policy 和临时 profile 补源收束成唯一解析器；
 * - 避免 UI、manager、collector、发送链路各自重复拼 `master + mode + assistant-disabled`；
 * - 为需要“本轮真正会不会采集/注入”的调用方提供稳定单真源。
 *
 * 边界：
 * - 这里只解析生效态，不直接触发正文采集或写入 runtime；
 * - profile 的临时补源只作用于当前轮结果，不会回写 policy/settings。
 */
import type { Assistant } from '@/types/assistant';
import { getBrowserContextConversationMode } from './conversation-mode';
import { resolveBrowserContextPolicyForAssistant } from './policy';
import { getBrowserContextSettings } from './settings';
import type {
  BrowserContextConversationMode,
  BrowserContextProfile,
  BrowserContextSettings,
  ResolvedBrowserContextPolicy,
} from './types';

/** 浏览器上下文单轮生效态。 */
export interface BrowserContextEffectiveState {
  /** 当前会话 key；缺失时为 `null`。 */
  conversationKey: string | null;
  /** 当前是否存在可用会话。 */
  hasConversation: boolean;
  /** 当前 settings 真源快照。 */
  settings: BrowserContextSettings;
  /** 当前会话模式真源快照。 */
  conversationMode: BrowserContextConversationMode;
  /** 当前会话是否启用了自动上下文。 */
  conversationEnabled: boolean;
  /** 全局 master 开关是否开启。 */
  masterEnabled: boolean;
  /** 当前 assistant policy 解析结果。 */
  resolvedPolicy: ResolvedBrowserContextPolicy;
  /** 当前是否被 assistant 显式禁用。 */
  disabledByAssistant: boolean;
  /** 当前轮真正可采集/注入。 */
  effective: boolean;
  /** 当前轮临时补源后的有效 profile。 */
  profile: BrowserContextProfile;
}

/**
 * 生成当前轮真正参与采集与注入的 profile。
 *
 * 说明：
 * - 全文网页模式不是新的 profile，只是当前轮的预算覆盖层；
 * - 若原 profile 不含 `readable-dom`，全文模式会临时补上；
 * - 若当前会话开启了风格信号模式，会临时补上 `page-style-signals`；
 * - 上述补源都只作用于当前轮，绝不回写策略中心真源。
 *
 * @param profile - 命中的基础 profile。
 * @param options - 当前轮会话模式与预算配置。
 * @returns 本轮有效 profile。
 */
export function buildEffectiveBrowserContextProfile(
  profile: BrowserContextProfile,
  options: {
    fullPageEnabled: boolean;
    styleSignalsEnabled: boolean;
    fullPagePromptChars: number;
  },
): BrowserContextProfile {
  const sources = [...profile.sources];
  if (options.fullPageEnabled && !sources.includes('readable-dom')) {
    sources.push('readable-dom');
  }
  if (options.styleSignalsEnabled && !sources.includes('page-style-signals')) {
    sources.push('page-style-signals');
  }
  return {
    ...profile,
    sources,
    maxPromptChars: options.fullPageEnabled ? options.fullPagePromptChars : profile.maxPromptChars,
  };
}

/**
 * 解析某个助手 + 会话当前真正生效的浏览器上下文状态。
 *
 * @param args - assistant 与会话信息。
 * @returns 当前轮唯一应该消费的生效态。
 */
export function resolveBrowserContextEffectiveState(args: {
  assistant: Pick<Assistant, 'id' | 'tags'> | null | undefined;
  conversationKey?: string | null;
}): BrowserContextEffectiveState {
  const conversationKey = String(args.conversationKey || '').trim() || null;
  const settings = getBrowserContextSettings();
  const conversationMode = getBrowserContextConversationMode(conversationKey);
  const resolvedPolicy = resolveBrowserContextPolicyForAssistant(args.assistant);
  const disabledByAssistant = resolvedPolicy.source === 'assistant-disabled';
  const profile = buildEffectiveBrowserContextProfile(
    { ...resolvedPolicy.profile, sources: [...resolvedPolicy.profile.sources] },
    {
      fullPageEnabled: conversationMode.fullPageEnabled,
      styleSignalsEnabled: conversationMode.styleSignalsEnabled,
      fullPagePromptChars: settings.fullPagePromptChars,
    },
  );

  return {
    conversationKey,
    hasConversation: Boolean(conversationKey),
    settings,
    conversationMode,
    conversationEnabled: conversationMode.enabled,
    masterEnabled: settings.enabled,
    resolvedPolicy,
    disabledByAssistant,
    effective: settings.enabled && conversationMode.enabled && !disabledByAssistant,
    profile,
  };
}
