/**
 * 说明：`icon-name` 工具模块。
 *
 * 职责：
 * - 收口模型管理里内置 logo / 图标 ID 到用户可读名称的格式化规则；
 * - 供 tooltip、aria-label 和其它只读展示场景共享；
 * - 避免多个 picker / 列表各自维护一套命名特例。
 *
 * 边界：
 * - 这里只负责名称格式化，不处理图标 URL、主题变体或选择逻辑。
 */

/** 根据内置图标 ID 生成用户可读名称。 */
export function formatIconName(id: string): string {
  const special: Record<string, string> = {
    openai: 'OpenAI',
    xai: 'xAI',
    lmstudio: 'LM Studio',
    huggingface: 'Hugging Face',
    'azure-openai': 'Azure OpenAI',
    siliconcloud: 'SiliconCloud',
    minimax: 'MiniMax',
  };
  if (special[id]) return special[id];
  return id.charAt(0).toUpperCase() + id.slice(1);
}
