/**
 * 说明：`TopicSettingsDialog` 页面模块。
 *
 * 职责：
 * - 承载 `TopicSettingsDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSettingsDialogProps`、`TopicSettingsDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TopicPanelContainer } from './TopicPanelContainer';

/** TopicSettingsDialog 组件入参。 */
export interface TopicSettingsDialogProps {
  /** 弹窗是否打开。 */
  open: boolean;
  /** 关闭弹窗。 */
  onClose: () => void;
  /** 打开模型管理。 */
  onOpenModelManager?: () => void;
}

/**
 * 当前激活话题的设置弹窗。
 *
 * @remarks
 * 入口仍然复用 `dialogs.showSettings`，但不再把表单内容嵌到主布局里，
 * 从而彻底消除聊天区被右侧设置面板挤压的旧行为。
 */
export function TopicSettingsDialog({ open, onClose, onOpenModelManager }: TopicSettingsDialogProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex min-h-0 min-w-0 max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 h-[min(85vh,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] w-[min(720px,calc(100vw-1.5rem))]">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border/60">
          <DialogTitle>{t('topicSettings.title')}</DialogTitle>
          <DialogDescription>
            {t('topicSettings.description')}
          </DialogDescription>
        </DialogHeader>

        <TopicPanelContainer onClose={onClose} onOpenModelManager={onOpenModelManager} />
      </DialogContent>
    </Dialog>
  );
}
