/**
 * 说明：Paint 参数可输入下拉框。
 *
 * 职责：
 * - 为 size、aspectRatio、quality 这类能力真源枚举参数提供统一控件；
 * - 只允许选择当前模型明确支持的枚举值，不再接受普通参数自定义输入；
 * - 受控 value 始终由外层 Paint 工作台写回。
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ImageGenerationParamOption } from '@/lib/ai/image-generation-params';

/** Paint 参数可输入下拉框属性。 */
export interface PaintParameterComboboxProps {
  /** 无障碍标签。 */
  readonly ariaLabel: string;
  /** 禁用状态。 */
  readonly disabled?: boolean;
  /** 候选项列表。 */
  readonly options: readonly ImageGenerationParamOption[];
  /** 输入框占位符。 */
  readonly placeholder: string;
  /** 当前值。 */
  readonly value: string;
  /** 值变化回调。 */
  readonly onChange: (value: string) => void;
}

/**
 * Paint 参数可输入下拉框。
 *
 * @param props - 控件属性。
 * @returns 可输入、可选择候选项的受控参数控件。
 */
export function PaintParameterCombobox({
  ariaLabel,
  disabled = false,
  options,
  placeholder,
  value,
  onChange,
}: PaintParameterComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const trimmedValue = query.trim();
  const normalizedValue = trimmedValue.toLowerCase();
  const filteredOptions = useMemo(() => {
    const query = normalizedValue;
    if (!query) return options;
    return options.filter((option) => option.value.toLowerCase().includes(query));
  }, [normalizedValue, options]);

  /**
   * 提交当前候选值。
   *
   * @param nextValue - 要写回外层 Paint 状态的参数值。
   */
  const commitValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOpen(false);
        setQuery(value);
      }}
    >
      <Input
        aria-label={ariaLabel}
        aria-expanded={!disabled && open}
        aria-haspopup="listbox"
        className="pr-9"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!disabled) setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
          }
        }}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      {open && !disabled ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div role="listbox" aria-label={ariaLabel} className="max-h-56 overflow-y-auto">
            {filteredOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                className="h-8 w-full justify-start gap-2 px-2 text-sm font-normal"
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitValue(option.value)}
              >
                <Check className={cn('h-4 w-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0 truncate">{option.value}</span>
              </Button>
            ))}

            {filteredOptions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">{t('paint.noRecommendedParams')}</div>
            ) : null}

          </div>
        </div>
      ) : null}
    </div>
  );
}
