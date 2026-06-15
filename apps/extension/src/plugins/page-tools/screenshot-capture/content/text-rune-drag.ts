/**
 * 说明：`screenshot-editor-text-rune-drag` 截图文字标注拖拽 helper。
 *
 * 职责：
 * - 从 pointer target 命中已提交文字 rune；
 * - 创建、推进并结束文字 rune 的移动拖拽会话；
 * - 保持 controller 主热路径只编排事件，不内联文字对象细节。
 *
 * 边界：
 * - 本模块不监听事件、不写 DOM 结构、不执行截图导出。
 */
import type { ScreenshotRuneManager } from './drawing';
import type { ActiveDrag, Point, ScreenshotEditorState, ScreenshotEditorUi } from './types';

/** 从事件目标中读取已提交文字标注 ID。 */
function readTextAnnotationId(refs: ScreenshotEditorUi, target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  const node = target.closest<HTMLElement>('.text-annotation[data-text-annotation-id]');
  if (!node || !refs.textLayer.contains(node)) return null;
  return node.dataset.textAnnotationId || null;
}

/** 尝试启动一次文字标注拖拽。 */
export function beginTextRuneDrag(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  runeManager: ScreenshotRuneManager,
  target: EventTarget | null,
  point: Point,
): boolean {
  const textAnnotationId = readTextAnnotationId(refs, target);
  if (!textAnnotationId) return false;
  const annotation = runeManager.getTextAnnotation(textAnnotationId);
  if (!annotation) return true;
  runeManager.selectTextAnnotation(textAnnotationId);
  runeManager.setTextAnnotationDragging(textAnnotationId, true);
  current.activeDrag = {
    mode: 'text-move',
    start: point,
    origin: {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    },
    textAnnotationId,
  };
  return true;
}

/** 推进文字标注拖拽；只有首次真实位移会写入撤销栈。 */
export function applyTextRuneDrag(
  runeManager: ScreenshotRuneManager,
  drag: ActiveDrag,
  delta: Point,
): boolean {
  if (drag.mode !== 'text-move' || !drag.textAnnotationId) return false;
  if (!drag.historyCaptured && (Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1)) {
    runeManager.pushHistory();
    drag.historyCaptured = true;
  }
  runeManager.moveTextAnnotation(drag.textAnnotationId, {
    x: drag.origin.x + delta.x,
    y: drag.origin.y + delta.y,
  });
  return true;
}

/** 结束文字标注拖拽，清理临时拖拽边界态。 */
export function finishTextRuneDrag(runeManager: ScreenshotRuneManager, drag: ActiveDrag): void {
  if (drag.mode === 'text-move') {
    runeManager.setTextAnnotationDragging(drag.textAnnotationId ?? null, false);
  }
}
