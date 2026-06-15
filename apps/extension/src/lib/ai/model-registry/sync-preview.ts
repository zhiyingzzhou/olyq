/**
 * 说明：`sync-preview` AI 能力模块。
 *
 * 职责：
 * - 承载 `sync-preview` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表 preview 重建懒加载入口。
 *
 * 为什么这个文件仍然保留：
 * - 页面环境里的 Provider 保存、模型管理面板、模型选项回退链路，仍然希望按需懒加载 preview rebuild，
 *   避免把这部分逻辑提前卷进首屏主 chunk；
 * - 但纯实现已经下沉到 `sync-preview-core.ts`，本文件只保留“页面端懒加载壳子”的职责；
 * - Service Worker / Worker 等无 DOM 环境禁止直接依赖本文件的动态导入链，应该改走 core 模块。
 *
 * 维护约束：
 * - 不要在这里追加 freshness、TTL、网络同步逻辑；
 * - 不要把新的运行时判断塞回本文件；
 * - 这里只负责把外部调用转发到纯实现模块，供页面侧继续稳定拆包。
 */

export {
  buildModelRegistryPreviewWithProviders,
} from './sync-preview-core'
