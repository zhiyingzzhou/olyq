/**
 * 说明：`AssistantTagPicker` 组件模块。
 *
 * 职责：
 * - 承载助手与预设编辑共用的标签选择器；
 * - 统一“已选标签 chips + 手动输入新增 + 已有标签列表点选”的交互结构；
 * - 对外只暴露固定的 `value / availableTags / onChange` contract。
 *
 * 边界：
 * - 本组件只处理标签选择交互，不负责任何持久化、toast 或业务表单提交；
 * - 不再提供旧的 focus-suggestions 浮层实现。
 */
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/** `AssistantTagPicker` 组件入参。 */
export interface AssistantTagPickerProps {
  /** 当前已选标签。 */
  value: string[];
  /** 可点选的已有标签全集。 */
  availableTags: string[];
  /** 标签变化回调。 */
  onChange: (tags: string[]) => void;
}

/**
 * 助手/预设共用标签选择器。
 *
 * @remarks
 * 当前产品不做全局标签管理弹窗，因此这里就是唯一的标签维护入口：
 * - 点击已有标签会在当前值里切换选中；
 * - `Enter` / `,` 会把输入框内容直接创建成新标签；
 * - `Backspace` 会在输入为空时回删最后一个已选标签。
 */
export function AssistantTagPicker({ value, availableTags, onChange }: AssistantTagPickerProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');

  const normalizedAvailableTags = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const rawTag of availableTags) {
      const tag = String(rawTag || '').trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
    return out.sort((left, right) => left.localeCompare(right));
  }, [availableTags]);

  const commitTags = useCallback((nextTags: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const rawTag of nextTags) {
      const tag = String(rawTag || '').trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
    onChange(out);
  }, [onChange]);

  const addTag = useCallback((rawTag: string) => {
    const tag = String(rawTag || '').trim();
    if (!tag || value.includes(tag)) {
      setInputValue('');
      return;
    }
    commitTags([...value, tag]);
    setInputValue('');
  }, [commitTags, value]);

  const removeTag = useCallback((tag: string) => {
    commitTags(value.filter((item) => item !== tag));
  }, [commitTags, value]);

  const toggleTag = useCallback((tag: string) => {
    if (value.includes(tag)) {
      removeTag(tag);
      return;
    }
    commitTags([...value, tag]);
  }, [commitTags, removeTag, value]);

  /**
   * 处理输入框快捷键。
   *
   * @remarks
   * 这里直接把输入态与标签态收口到一个入口，避免 UI 再长出第二套“新标签确认”按钮。
   */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(inputValue);
      return;
    }
    if (event.key === 'Backspace' && !inputValue && value.length > 0) {
      event.preventDefault();
      removeTag(value[value.length - 1]);
    }
  }, [addTag, inputValue, removeTag, value]);

  return (
    <div className="space-y-2">
      <div className="flex min-h-[44px] flex-wrap gap-1.5 rounded-xl border border-input bg-background px-2.5 py-2">
        {value.length > 0 ? value.map((tag) => (
          <Badge key={tag} variant="secondary" className="h-6 gap-1 rounded-full px-2 text-xs">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full text-muted-foreground transition-colors hover:text-destructive"
              aria-label={t('assistant.removeTag', { tag })}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )) : (
          <span className="self-center text-xs text-muted-foreground">{t('assistant.tagsEmpty')}</span>
        )}
      </div>

      <Input
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('assistant.tagsInputPlaceholder')}
        className="h-9 text-sm"
      />

      <div className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {t('assistant.availableTags')}
        </div>
        <div className="flex flex-wrap gap-2">
          {normalizedAvailableTags.length > 0 ? normalizedAvailableTags.map((tag) => {
            const selected = value.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={selected}
                className={
                  selected
                    ? 'rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors'
                    : 'rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
                }
              >
                {tag}
              </button>
            );
          }) : (
            <div className="text-xs text-muted-foreground">{t('assistant.availableTagsEmpty')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
