/**
 * 说明：`native-web-search` AI 能力模块。
 *
 * 职责：
 * - 在纯能力矩阵基础上，为 stream-chat 运行时创建 provider-hosted tools；
 * - 为 OpenRouter raw server tool 注入 request transformer 可消费的 providerOptions 哨兵；
 * - 统一合并 native provider tools 与 Memory/MCP tools。
 *
 * 边界：
 * - 三态能力判断只来自 `native-web-search-capability`；
 * - 本模块只在后台模型调用链使用，UI 不应 import 本模块；
 * - 外部搜索 `webSearchProviderId` 启用时，本模块不注入模型内置搜索。
 */
import type { ToolSet } from 'ai';

import { isPlainRecord } from '@/lib/utils/type-guards';

import type { StreamContext } from './stream-chat-context';
import type { ModelCallParamsBase } from './types';
import type { ProviderOptionsPatch } from './providers/adapter-types';
import { loadAdapter } from './providers/load-adapter';
import { OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL } from './native-web-search-constants';
import { buildOpenRouterNativeWebSearchParameters } from './native-web-search-params';
import {
  resolveNativeWebSearchCapability,
  type NativeWebSearchCapability,
} from './native-web-search-capability';

/** 运行时 native web search patch。 */
export interface NativeWebSearchPatch {
  /** 需要合并进 AI SDK `tools` 的 provider-hosted 工具集合。 */
  readonly tools?: ToolSet;
  /** 需要合并进 providerOptions 的内部 patch。 */
  readonly providerOptions?: ProviderOptionsPatch;
  /** 本轮最终采用的能力结论。 */
  readonly capability: NativeWebSearchCapability;
}

/**
 * 基于真实 StreamContext 解析本轮 native web search patch。
 *
 * @param ctx - 已解析出的 provider/model 上下文。
 * @param params - 当前聊天请求参数。
 * @param existingTools - Memory/MCP 等前序 pipeline 已收集的工具集合。
 * @returns 需要合并进 tools/providerOptions 的 patch；不启用或不支持时返回 undefined。
 */
export async function resolveNativeWebSearchPatch(
  ctx: StreamContext,
  params: ModelCallParamsBase,
  existingTools?: ToolSet,
): Promise<NativeWebSearchPatch | undefined> {
  const externalWebSearchProviderId = (params as { webSearchProviderId?: unknown }).webSearchProviderId;
  if (!params.enableWebSearch || externalWebSearchProviderId) return undefined;

  const capability = resolveNativeWebSearchCapability({
    providerId: ctx.providerId,
    providerType: ctx.providerType,
    effectiveProviderType: ctx.effectiveProviderType,
    transportProtocol: ctx.resolvedModelMeta.transportProtocol,
    modelId: ctx.modelId,
    featureKeys: ctx.featureKeys,
    supportedParameters: ctx.resolvedModelMeta.supportedParameters ?? ctx.modelConfig?.supportedParameters,
  });
  if (capability.state !== 'supported') return undefined;

  if (
    capability.injectionKind === 'provider-hosted-tool'
    && (ctx.effectiveProviderType === 'gemini' || ctx.effectiveProviderType === 'vertexai')
    && existingTools
    && Object.keys(existingTools).length > 0
    && !/^gemini-3(?:[\w.-]*)/i.test(ctx.modelId)
  ) {
    return undefined;
  }

  if (capability.injectionKind === 'provider-hosted-tool') {
    const adapterType = ctx.effectiveProviderType ?? ctx.providerType;
    const adapter = adapterType ? await loadAdapter(adapterType) : undefined;
    const tools = adapter?.createNativeWebSearchTools?.({
      providerId: ctx.providerId,
      modelId: ctx.modelId,
      config: ctx.providerConfig!,
      transportProtocol: ctx.resolvedModelMeta.transportProtocol,
      capability,
      params: {
        modelParams: isPlainRecord(params.modelParams) ? params.modelParams : undefined,
      },
    });
    if (!tools || Object.keys(tools).length === 0) return undefined;
    return { capability, tools };
  }

  if (capability.injectionKind === 'raw-server-tool') {
    if (ctx.providerId === 'openrouter' && ctx.providerOptionsKey) {
      const modelParams = isPlainRecord(params.modelParams) ? params.modelParams : undefined;
      const openRouterParameters = buildOpenRouterNativeWebSearchParameters(modelParams);
      return {
        capability,
        providerOptions: {
          [ctx.providerOptionsKey]: {
            [OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL]: openRouterParameters ?? true,
          },
        },
      };
    }
  }

  return { capability };
}

/** 把多个 ToolSet 按先到先得的规则合并。 */
export function mergeToolSets(...toolSets: ReadonlyArray<ToolSet | undefined>): ToolSet | undefined {
  const merged: ToolSet = {};
  for (const toolSet of toolSets) {
    if (!toolSet) continue;
    for (const [name, tool] of Object.entries(toolSet)) {
      if (name in merged) continue;
      merged[name] = tool;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
