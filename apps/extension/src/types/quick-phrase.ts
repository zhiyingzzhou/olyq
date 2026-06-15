/**
 * 说明：`quick-phrase` 类型定义模块。
 *
 * 职责：
 * - 定义全局快捷短语与助手常用短语共用的持久化结构；
 * - 保持结构可序列化，便于进入 `chrome.storage.local`、助手树与同步快照；
 * - 不承载任何 UI 状态或运行时回调。
 *
 * 边界：
 * - 本文件只描述当前格式，不提供旧字段兼容或迁移链。
 */

/**
 * 快捷短语条目。
 *
 * @remarks
 * `title` 用于列表展示，`content` 用于插入聊天输入框。
 * `order` 越大越靠前；全局短语和助手级常用短语都遵守同一排序语义。
 */
export interface QuickPhrase {
  /** 短语 ID。 */
  id: string;
  /** 短语标题，用于列表展示。 */
  title: string;
  /** 插入到输入框的短语正文。 */
  content: string;
  /** 创建时间，毫秒时间戳。 */
  createdAt: number;
  /** 最近更新时间，毫秒时间戳。 */
  updatedAt: number;
  /** 排序值，数值越大越靠前。 */
  order: number;
}

/** 新建或编辑快捷短语时允许写入的正文结构。 */
export interface QuickPhraseDraft {
  /** 短语标题。 */
  title: string;
  /** 短语正文。 */
  content: string;
}
