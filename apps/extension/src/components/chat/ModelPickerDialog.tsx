/**
 * 说明：`ModelPickerDialog` 组件模块。
 *
 * 职责：
 * - 承载 `ModelPickerDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelPickerDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ModelPickerDialogProps } from '@/components/chat/model-picker/shared';
import ModelPickerDialogImpl from './ModelPickerDialogImpl';

/**
 * 导出组件：`ModelPickerDialog`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ModelPickerDialog(props: ModelPickerDialogProps) {
  if (!props.open) return null;
  return <ModelPickerDialogImpl {...props} />;
}
