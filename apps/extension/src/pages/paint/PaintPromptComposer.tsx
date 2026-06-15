/**
 * 说明：`PaintPromptComposer` 页面模块。
 *
 * 职责：
 * - 承载 `PaintPromptComposer` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintPromptComposer` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/** 绘图提示词编辑器属性。 */
interface PaintPromptComposerProps {
  /** 当前是否正在生成图片。 */
  readonly isGenerating: boolean;
  /** 当前选中模型的展示名称。 */
  readonly modelLabel: string;
  /** 当前提示词内容。 */
  readonly prompt: string;
  /** 触发生成图片。 */
  readonly onGenerate: () => void | Promise<void>;
  /** 更新提示词。 */
  readonly onPromptChange: (value: string) => void;
  /** 终止当前生成。 */
  readonly onStop: () => void;
}

/**
 * 绘图提示词编辑器。
 *
 * 提供提示词输入、快捷键发送和生成中断入口。
 */
export function PaintPromptComposer({
  isGenerating,
  modelLabel,
  prompt,
  onGenerate,
  onPromptChange,
  onStop,
}: PaintPromptComposerProps) {
  const { t } = useTranslation();

  /**
   * 处理文本域快捷键。
   *
   * `Ctrl/Cmd + Enter` 发送生成，`Esc` 在生成中断。
   */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void onGenerate();
      return;
    }
    if (e.key === 'Escape' && isGenerating) {
      e.preventDefault();
      onStop();
    }
  };

  return (
    <div
      data-paint-prompt-composer
      className="rounded-2xl border border-border/60 bg-card/50 p-3 shadow-sm backdrop-blur-sm transition-all duration-200 focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">{t('paint.prompt')}</div>
        <div className="min-w-0 truncate text-[11px] text-muted-foreground">
          {modelLabel || t('paint.modelRequired')}
        </div>
      </div>
      <textarea
        value={prompt}
        placeholder={t('paint.promptPlaceholder')}
        disabled={isGenerating}
        className="min-h-20 w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <div aria-hidden className="min-w-0 flex-1" />
        <div className="flex items-center gap-2">
          {isGenerating ? (
            <Button variant="secondary" onClick={onStop}>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('paint.stop')}
            </Button>
          ) : (
            <Button onClick={() => void onGenerate()}>{t('paint.generate')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
