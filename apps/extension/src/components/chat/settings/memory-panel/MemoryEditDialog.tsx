/**
 * 说明：`MemoryEditDialog` 组件模块。
 *
 * 职责：
 * - 承载 `MemoryEditDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MemoryEditDialogProps`、`MemoryEditDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/** MemoryPanel 编辑弹窗属性。 */
export interface MemoryEditDialogProps {
  /** 是否打开编辑弹窗。 */
  readonly open: boolean;
  /** 当前正在编辑的记忆内容草稿。 */
  readonly value: string;
  /** 控制弹窗开关；关闭时通常由父层同时清理当前编辑上下文。 */
  readonly onOpenChange: (open: boolean) => void;
  /** 更新编辑文本。每次输入变化都会回传到父层状态。 */
  readonly onChange: (value: string) => void;
  /** 提交保存。允许父层接入异步持久化逻辑。 */
  readonly onSave: () => void | Promise<void>;
}

/**
 * MemoryPanel 编辑弹窗。
 *
 * 这里只承载 UI 与输入事件透传，不直接管理保存状态、持久化或错误提示，
 * 这些副作用全部由上层控制器接管，保证弹窗本身保持纯展示组件职责。
 */
export function MemoryEditDialog({
  open,
  value,
  onOpenChange,
  onChange,
  onSave,
}: MemoryEditDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('memory.editTitle')}</DialogTitle>
          <DialogDescription>{t('memory.editDesc')}</DialogDescription>
        </DialogHeader>
        {/* 文本域内容与父层 state 双向同步，便于统一做脏值控制与保存。 */}
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[120px]" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void onSave()} disabled={!value.trim()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
