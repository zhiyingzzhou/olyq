/**
 * 说明：`MemoryListSection` 组件模块。
 *
 * 职责：
 * - 承载 `MemoryListSection` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MemoryListSectionProps`、`MemoryListSection` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TooltipAction } from '@/components/ui/tooltip-action';
import type { MemoryItem } from '@/lib/memory';

/** MemoryPanel 列表区属性。 */
export interface MemoryListSectionProps {
  /** 全量记忆列表。 */
  readonly memories: ReadonlyArray<MemoryItem>;
  /** 当前筛选后的记忆列表。由父层根据搜索词预处理后传入。 */
  readonly filteredMemories: ReadonlyArray<MemoryItem>;
  /** 是否打开新增表单。 */
  readonly addOpen: boolean;
  /** 新增记忆草稿文本。 */
  readonly addText: string;
  /** 当前搜索关键词。 */
  readonly search: string;
  /** 打开或关闭新增表单。 */
  readonly onSetAddOpen: (open: boolean) => void;
  /** 更新新增文本。 */
  readonly onSetAddText: (value: string) => void;
  /** 更新搜索关键词。 */
  readonly onSetSearch: (value: string) => void;
  /** 提交新增。允许父层执行异步写入与提示。 */
  readonly onAdd: () => void | Promise<void>;
  /** 打开某条记忆的编辑弹窗。 */
  readonly onOpenEdit: (item: MemoryItem) => void;
  /** 删除单条记忆。 */
  readonly onDelete: (id: string, content: string) => void | Promise<void>;
  /** 清空全部记忆。 */
  readonly onClearAll: () => void | Promise<void>;
}

/**
 * MemoryPanel 记忆列表区。
 *
 * 负责新增、搜索、浏览、编辑入口和删除入口等列表侧交互。
 * 实际的数据过滤、写入和删除确认策略都由父层控制器负责，这里只透传事件。
 */
export function MemoryListSection({
  memories,
  filteredMemories,
  addOpen,
  addText,
  search,
  onSetAddOpen,
  onSetAddText,
  onSetSearch,
  onAdd,
  onOpenEdit,
  onDelete,
  onClearAll,
}: MemoryListSectionProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {t('memory.listTitle')}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t('memory.listCount', { count: memories.length })}</span>
        </h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSetAddOpen(!addOpen)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('memory.add')}
          </Button>
          {memories.length > 0 ? (
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => void onClearAll()}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('memory.clear')}
            </Button>
          ) : null}
        </div>
      </div>

      {addOpen ? (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          {/* 新增表单与父层草稿同步，便于统一处理保存成功后的清空逻辑。 */}
          <Textarea
            placeholder={t('memory.addPlaceholder')}
            value={addText}
            onChange={(event) => onSetAddText(event.target.value)}
            className="min-h-[60px] text-sm"
          />
          <div className="flex items-center gap-2">
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onSetAddOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={() => void onAdd()} disabled={!addText.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : null}

      {memories.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSetSearch(event.target.value)}
              placeholder={t('memory.searchPlaceholder')}
              className="h-7 pl-6 text-xs"
            />
            {search ? (
              <TooltipAction tooltip={t('common.clear')}>
                <button
                  type="button"
                  onClick={() => onSetSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </TooltipAction>
            ) : null}
          </div>
        </div>
      ) : null}

      {filteredMemories.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {/* 无结果时根据全量列表长度区分“完全为空”和“搜索无匹配”两种语义。 */}
          {memories.length === 0 ? t('memory.empty') : t('memory.noMatch')}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredMemories.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-2 rounded-lg border border-border bg-card/60 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm leading-relaxed">{item.memory}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(item.updatedAt || item.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                <TooltipAction tooltip={t('common.edit')}>
                  <button
                    type="button"
                    onClick={() => onOpenEdit(item)}
                    className="rounded p-1 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </TooltipAction>
                <TooltipAction tooltip={t('common.delete')}>
                  <button
                    type="button"
                    onClick={() => void onDelete(item.id, item.memory)}
                    className="rounded p-1 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipAction>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
