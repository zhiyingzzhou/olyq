/**
 * 说明：Provider 详情页连接配置工具。
 *
 * 职责：
 * - 集中判断哪些 Provider 需要在详情页显示非云厂商的专用连接字段；
 * - 避免 React 组件文件导出非组件工具函数，保持 Fast Refresh 规则干净。
 *
 * 边界：
 * - 这里只做 UI 暴露面判定，不负责运行时 endpoint、鉴权或存储 schema。
 */
import type { Provider } from '@/components/chat/settings/model-manager/shared';

/** 判断当前 Provider 是否需要在详情页显示专用连接配置。 */
export function isProviderConnectionDetailProvider(provider: Provider): boolean {
  return provider.type === 'azure-openai' || provider.type === 'new-api';
}
