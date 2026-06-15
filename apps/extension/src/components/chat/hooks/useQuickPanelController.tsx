/**
 * 说明：`useQuickPanelController` 组件模块。
 *
 * 职责：
 * - 承载 `useQuickPanelController` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
export type {
  QuickPanelActionItem,
  QuickPanelItem,
  QuickPanelKind,
  QuickPanelMenu,
  QuickPanelMenuItem,
  QuickPanelOpenOptions,
  QuickPanelSlashCommand,
  UseQuickPanelControllerOptions,
  UseQuickPanelControllerResult,
} from './quick-panel/types';
export { useQuickPanelController } from './quick-panel/useQuickPanelControllerImpl';
