/**
 * 说明：`TopicSidebarDialogs` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebarDialogs` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSidebarDialogs` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/** 侧边栏附属弹窗属性。 */
interface TopicSidebarDialogsProps {
  /** Prompt 编辑弹窗是否打开。 */
  readonly promptDialogOpen: boolean;
  /** 当前 Prompt 编辑文本。 */
  readonly promptText: string;
  /** 自动重命名错误信息；非空时打开错误弹窗。 */
  readonly renameError: string | null;
  /** 控制 Prompt 编辑弹窗开关。 */
  readonly onChangePromptDialogOpen: (open: boolean) => void;
  /** 更新 Prompt 文本。 */
  readonly onChangePromptText: (value: string) => void;
  /** 关闭自动重命名错误弹窗。 */
  readonly onCloseRenameError: () => void;
  /** 保存 Prompt。 */
  readonly onSavePrompt: () => void;
}

/**
 * 提炼自动命名失败的摘要文案。
 *
 * 说明：
 * - 自动命名错误经常夹带整段 HTTP/data payload，直接放进标题区会把弹窗视觉节奏冲乱；
 * - 这里优先保留首行里的“人工可读部分”，遇到 url / data payload / JSON 片段就提前截断；
 * - 如果提炼后仍然没有稳定摘要，就回退到通用说明，让完整原文留在详情区展示。
 */
function summarizeRenameError(renameError: string | null): string {
  const normalizedError = renameError?.trim();
  if (!normalizedError) return '';

  const firstLine = normalizedError
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return '';

  const machinePayloadStart = [firstLine.indexOf(' data:'), firstLine.indexOf(' https://'), firstLine.indexOf(' http://'), firstLine.indexOf(' {"')]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const humanReadableLine = (machinePayloadStart === undefined ? firstLine : firstLine.slice(0, machinePayloadStart)).replace(/\s+/g, ' ').trim();
  if (!humanReadableLine) return '';
  return humanReadableLine.length > 120 ? `${humanReadableLine.slice(0, 117).trimEnd()}…` : humanReadableLine;
}

/**
 * 话题侧边栏附属弹窗集合。
 *
 * 统一承载话题 Prompt 编辑和自动重命名错误提示，
 * 避免这些临时弹窗逻辑散落在主容器中。
 */
export function TopicSidebarDialogs({
  promptDialogOpen,
  promptText,
  renameError,
  onChangePromptDialogOpen,
  onChangePromptText,
  onCloseRenameError,
  onSavePrompt,
}: TopicSidebarDialogsProps) {
  const { t } = useTranslation();
  const normalizedRenameError = renameError?.trim() ?? '';
  const renameErrorSummary = summarizeRenameError(renameError);

  return (
    <>
      <Dialog open={promptDialogOpen} onOpenChange={(open) => !open && onChangePromptDialogOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('sidebar.topicPrompt')}</DialogTitle>
            <DialogDescription>{t('sidebar.topicPromptDesc')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={promptText}
            onChange={(event) => onChangePromptText(event.target.value)}
            placeholder={t('sidebar.topicPromptPlaceholder')}
            className="min-h-[160px] text-sm"
            data-testid="topic-prompt-input"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onChangePromptDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={onSavePrompt} data-testid="topic-prompt-save">
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameError !== null} onOpenChange={(open) => !open && onCloseRenameError()}>
        {/* 自动命名失败时展示经过净化的稳定文案，避免把原始 SSE / prompt payload 直接暴露给用户。 */}
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
            <DialogTitle className="text-base">{t('sidebar.autoRenameError')}</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              {renameErrorSummary || t('sidebar.autoRenameErrorDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">{t('common.error')}</div>
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground/90 break-all">
                {renameErrorSummary || t('sidebar.autoRenameError')}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">{t('sidebar.autoRenameErrorDetails')}</div>
              <pre className="max-h-[44vh] overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
                {normalizedRenameError || t('common.noData')}
              </pre>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4">
            <Button size="sm" onClick={onCloseRenameError}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
