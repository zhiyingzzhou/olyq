/**
 * 说明：`utils` 组件模块。
 *
 * 职责：
 * - 承载 `utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getQuickPanelDefaultHints`、`removeAtSymbolAndText` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { SelectionPanelHint } from '@/components/chat/SelectionPanelShared';

import type { TranslateFn } from './types';

/**
 * 导出函数：`getQuickPanelDefaultHints`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getQuickPanelDefaultHints(t: TranslateFn, canBack: boolean): SelectionPanelHint[] {
  const hints: SelectionPanelHint[] = [
    { id: 'close', keyLabel: 'ESC', text: t('common.close') },
    { id: 'select', keyLabel: '↑↓', text: t('common.select') },
    { id: 'page', keyLabel: 'PgUp/PgDn', text: t('common.page') },
  ];
  if (canBack) {
    hints.push({ id: 'back', keyLabel: 'Ctrl/Cmd + ←', text: t('common.prev'), active: true });
  }
  hints.push({ id: 'confirm', keyLabel: '↩', text: t('common.confirm') });
  return hints;
}

/**
 * 导出函数：`removeAtSymbolAndText`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function removeAtSymbolAndText(currentText: string, fallbackPosition: number) {
  const position = Math.max(0, Math.min(Number(fallbackPosition) || 0, currentText.length));
  if (position < 0 || position >= currentText.length) return currentText;
  if (currentText[position] !== '@') return currentText;

  let endPosition = position + 1;
  while (endPosition < currentText.length && !/\s/.test(currentText[endPosition]!)) {
    endPosition += 1;
  }
  return currentText.slice(0, position) + currentText.slice(endPosition);
}
