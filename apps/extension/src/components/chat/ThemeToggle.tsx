/**
 * 说明：`ThemeToggle` 组件模块。
 *
 * 职责：
 * - 承载 `ThemeToggle` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ThemeToggle` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { setTheme, subscribeThemeChange } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** ThemeToggle 入参：支持透传 button 属性（常用于自定义尺寸/样式） */
type ThemeToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
  /** hover / focus 时展示的 tooltip 文案。 */
  tooltip?: string;
};

/**
 * 主题切换按钮。
 *
 * 说明：
 * - 点击后会在浅色和深色主题之间切换，并继续透传调用方自定义点击逻辑；
 * - 组件自身通过订阅主题变化保持图标状态与文档根节点一致。
 */
export function ThemeToggle({ className, onClick, tooltip, ...props }: ThemeToggleProps) {
  const { t } = useTranslation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const off = subscribeThemeChange(() => setDark(document.documentElement.classList.contains('dark')));
    return () => off();
  }, []);

  const tooltipText = tooltip ?? t('appearance.toggleTheme');

  return (
    <TooltipAction tooltip={tooltipText} ariaLabel={tooltipText}>
      <button
        onClick={(e) => {
          setTheme(dark ? 'light' : 'dark');
          onClick?.(e);
        }}
        className={cn(
          'p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
          className,
        )}
        {...props}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </TooltipAction>
  );
}
