/**
 * 说明：`PromptLibrary` 组件模块。
 *
 * 职责：
 * - 承载 `PromptLibrary` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PromptLibrary` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState, useMemo } from 'react';
import { Plus, Trash2, Zap, Search } from 'lucide-react';
import type { PromptTemplate } from '@/types/chat';
import { getBuiltinPrompts } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { useTranslation } from 'react-i18next';

/** 新建用户提示词的入参 */
type CreatePromptInput = {
  /** 标题 */
  title: string;
  /** 提示词正文 */
  content: string;
  /** 分类（用于分组展示） */
  category: string;
};

/** PromptLibrary 组件入参：用于选择/创建/删除提示词模板 */
interface Props {
  /** 是否打开弹窗 */
  open: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 用户自定义提示词列表（不包含内置模板） */
  userPrompts: PromptTemplate[];
  /** 新增用户提示词回调 */
  onAdd: (p: CreatePromptInput) => void;
  /** 删除用户提示词回调 */
  onDelete: (id: string) => void;
  /** 应用某条提示词，把模板正文插入聊天输入框。 */
  onApply: (content: string) => void;
}

/**
 * Prompt 模板库弹窗。
 *
 * 负责：
 * - 展示内置与用户自定义提示词
 * - 提供分类筛选、搜索、创建和删除能力
 * - 在选中某条模板后把内容交给上层输入区作为用户草稿
 */
export function PromptLibrary({ open, onClose, userPrompts, onAdd, onDelete, onApply }: Props) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const builtinPrompts = useMemo(() => getBuiltinPrompts(t), [t]);
  const allPrompts = useMemo(() => [...builtinPrompts, ...userPrompts], [builtinPrompts, userPrompts]);
  const categories = useMemo(() => [...new Set(allPrompts.map(p => p.category))], [allPrompts]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPrompts.filter(p =>
      (!filter || p.category === filter) &&
      (!q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
    );
  }, [allPrompts, filter, search]);

  /** 校验并创建一条新的用户自定义提示词模板。 */
  const handleCreate = () => {
    if (title.trim() && content.trim()) {
      onAdd({ title: title.trim(), content: content.trim(), category: category.trim() || t('prompt.user') });
      setTitle(''); setContent(''); setCategory(''); setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> {t('prompt.library')}</DialogTitle>
          <DialogDescription className="sr-only">{t('prompt.description')}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('prompt.search')} className="text-sm h-8 pl-8" />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filter === '' ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setFilter('')}>{t('common.all')}</Button>
          {categories.map(c => (
            <Button key={c} size="sm" variant={filter === c ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setFilter(c)}>{c}</Button>
          ))}
          <Button size="sm" variant="ghost" className="text-xs h-7 ml-auto" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t('prompt.addPrompt')}
          </Button>
        </div>

        {creating && (
          <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/30">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('prompt.title')} className="text-sm" />
            <Input value={category} onChange={e => setCategory(e.target.value)} placeholder={t('prompt.categoryOptional')} className="text-sm" />
            <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder={t('prompt.content')} className="text-sm min-h-[80px]" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
              <Button size="sm" onClick={handleCreate}>{t('common.save')}</Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{p.title}</h4>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.category}</span>
                  {p.isBuiltin && <span className="text-xs text-muted-foreground">{t('prompt.builtin')}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.content}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { onApply(p.content); onClose(); }}>{t('prompt.apply')}</Button>
                {!p.isBuiltin && (
                  <TooltipAction tooltip={t('common.delete')}>
                    <button onClick={() => onDelete(p.id)} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TooltipAction>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
