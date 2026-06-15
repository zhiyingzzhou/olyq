/**
 * 说明：`message-mutation-recorder` 同步模块。
 *
 * 职责：
 * - 承载 `message-mutation-recorder` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
export {
  recordDeletedMessages,
  recordTopicMessagesChange,
  recordTopicMessagesCleared,
} from './sync-engine';
