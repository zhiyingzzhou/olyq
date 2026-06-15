/**
 * 说明：`QuickPhraseCreateDialog` 组件模块。
 *
 * 职责：
 * - 承载聊天输入区内联新增快捷短语的阻塞式弹窗；
 * - 让用户选择写入当前助手常用短语或全局快捷短语；
 * - 使用扩展现有 Dialog / RadioGroup / Input 规范，不复用 Ant Design 实现。
 *
 * 边界：
 * - 本组件只产出短语草稿和目标作用域，不直接写存储或助手 store；
 * - 是否允许助手级写入由上层根据当前聊天上下文决定。
 */
import { useEffect, useState } from 'react';
import { BotMessageSquare, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { QuickPhraseDraft } from '@/types/quick-phrase';

/** 快捷短语新增目标作用域。 */
export type QuickPhraseCreateScope = 'assistant' | 'global';

/** 快捷短语新增弹窗属性。 */
export interface QuickPhraseCreateDialogProps {
  /** 是否打开弹窗。 */
  readonly open: boolean;
  /** 打开状态变化回调。 */
  readonly onOpenChange: (open: boolean) => void;
  /** 当前是否可以写入助手级常用短语。 */
  readonly canSaveToAssistant: boolean;
  /** 翻译函数。 */
  readonly t: (key: string, options?: Record<string, unknown>) => string;
  /** 提交短语草稿。 */
  readonly onSubmit: (scope: QuickPhraseCreateScope, draft: QuickPhraseDraft) => void;
}

/**
 * 聊天输入区新增快捷短语弹窗。
 *
 * @param props - 打开状态、作用域能力与提交回调。
 * @returns 新增短语表单。
 */
export function QuickPhraseCreateDialog({
  open,
  onOpenChange,
  canSaveToAssistant,
  t,
  onSubmit,
}: QuickPhraseCreateDialogProps) {
  const [scope, setScope] = useState<QuickPhraseCreateScope>(canSaveToAssistant ? 'assistant' : 'global');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setScope(canSaveToAssistant ? 'assistant' : 'global');
    setTitle('');
    setContent('');
  }, [canSaveToAssistant, open]);

  const canSubmit = title.trim().length > 0 && content.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('quickPhrase.add')}</DialogTitle>
          <DialogDescription>{t('quickPhrase.addFromInputDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('quickPhrase.titleLabel')}</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('quickPhrase.titlePlaceholder')}
              className="h-9"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('quickPhrase.contentLabel')}</Label>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t('quickPhrase.contentPlaceholder')}
              className="min-h-[120px] resize-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('quickPhrase.saveTo')}</Label>
            <RadioGroup value={scope} onValueChange={(value) => setScope(value as QuickPhraseCreateScope)}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent/40">
                <RadioGroupItem value="assistant" disabled={!canSaveToAssistant} className="mt-0.5" />
                <BotMessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-medium">{t('quickPhrase.assistantScope')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {canSaveToAssistant ? t('quickPhrase.assistantScopeDesc') : t('quickPhrase.assistantScopeUnavailable')}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent/40">
                <RadioGroupItem value="global" className="mt-0.5" />
                <Zap className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-medium">{t('quickPhrase.globalScope')}</span>
                  <span className="block text-xs text-muted-foreground">{t('quickPhrase.globalScopeDesc')}</span>
                </span>
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onSubmit(scope, { title: title.trim(), content: content.trim() });
              onOpenChange(false);
            }}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
