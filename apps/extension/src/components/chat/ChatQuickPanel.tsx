/**
 * 说明：`ChatQuickPanel` 组件模块。
 *
 * 职责：
 * - 承载 `ChatQuickPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatQuickPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { SelectionPanelEmpty, SelectionPanelHintBar, SelectionPanelRow, type SelectionPanelHint } from '@/components/chat/SelectionPanelShared';
import type { QuickPanelItem, QuickPanelMenu } from '@/components/chat/hooks/useQuickPanelController';
import { cn } from '@/lib/utils';

/** 聊天快捷面板属性。 */
type ChatQuickPanelProps = {
  /** 面板根节点引用，供外层处理点击外部关闭与滚动定位。 */
  readonly panelRef: RefObject<HTMLDivElement | null>;
  /** 当前激活的菜单元信息。 */
  readonly activeMenu: QuickPanelMenu;
  /** 当前菜单下可选的扁平条目。 */
  readonly items: QuickPanelItem[];
  /** 面板承载位置。 */
  readonly placement: 'anchored' | 'inline';
  /** 当前高亮项索引。 */
  readonly activeIndex: number;
  /** 标题旁边展示的触发符号，如 `/`、`\@`。 */
  readonly inlineSymbol: string | null;
  /** 底部提示栏主标签。 */
  readonly footerLabel: string;
  /** 是否展示头部 badge。 */
  readonly showFooterBadge: boolean;
  /** 底部快捷键提示列表。 */
  readonly hints: SelectionPanelHint[];
  /** 当前是否允许回退到上一级菜单。 */
  readonly canGoBack: boolean;
  /** 回退按钮无障碍文案。 */
  readonly backLabel: string;
  /** 当前菜单为空时使用的兜底标题。 */
  readonly emptyTitleFallback: string;
  /** 回退到上一级菜单。 */
  readonly onGoBack: () => void;
  /** 选中某个快捷面板条目。 */
  readonly onSelectItem: (item: QuickPanelItem) => void;
};

/**
 * 聊天输入区的快捷命令面板。
 *
 * 该组件只负责渲染菜单、选中态和交互事件透传；
 * 真正的菜单切换、过滤和选择副作用都由 `useQuickPanelController` 承担。
 */
export function ChatQuickPanel({
  panelRef,
  activeMenu,
  items,
  placement,
  activeIndex,
  inlineSymbol,
  footerLabel,
  showFooterBadge,
  hints,
  canGoBack,
  backLabel,
  emptyTitleFallback,
  onGoBack,
  onSelectItem,
}: ChatQuickPanelProps) {
  const placeholderLabel = activeMenu.placeholderLabel ?? activeMenu.title;
  const subtitle = activeMenu.subtitle ?? placeholderLabel;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    setHoveredIndex(null);
  }, [activeMenu.id, items]);

  return (
    <div
      ref={panelRef}
      data-quick-panel-placement={placement}
      data-quick-panel-variant="input-replica"
      className={cn(
        'overflow-hidden',
        placement === 'anchored'
          ? 'w-full'
          : 'absolute bottom-full left-0 z-50 mb-2 w-full max-w-80 rounded-xl border border-border bg-background shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0 space-y-1">
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-2">
              <span className="text-muted-foreground">
                {activeMenu.headerIcon ?? (
                  <span className="text-sm font-medium text-muted-foreground">{inlineSymbol ?? '?'}</span>
                )}
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {activeMenu.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{subtitle}</span>
              {showFooterBadge ? (
                <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                  {footerLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {canGoBack ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onMouseDown={(event) => {
              event.preventDefault();
              onGoBack();
            }}
            aria-label={backLabel}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="border-t border-border" />

      {items.length > 0 ? (
        <div
          className="max-h-[20rem] overflow-y-auto py-1"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {items.map((item, index) => {
            const previousItem = items[index - 1];
            const hovered = hoveredIndex === index;
            const active = hovered || (hoveredIndex === null && index === activeIndex);
            const selected = Boolean(item.selected);
            const presentation = item.presentation ?? 'default';
            const showSectionLabel = Boolean(
              item.sectionKey
              && item.sectionLabel
              && item.sectionKey !== previousItem?.sectionKey,
            );
            const showSettingsDivider = Boolean(
              presentation === 'settings'
              && previousItem
              && previousItem.presentation !== 'settings',
            );

            return (
              <div
                key={item.id}
                data-quick-panel-item
                data-quick-panel-item-id={item.id}
                data-active={active ? 'true' : 'false'}
                data-presentation={presentation}
              >
                {showSectionLabel ? (
                  <div className={cn('px-4 pb-1 text-[11px] text-muted-foreground', index > 0 ? 'pt-2' : 'pt-1')}>
                    {item.sectionLabel}
                  </div>
                ) : null}
                {showSettingsDivider ? <div className="my-1 border-t border-border" /> : null}
                <SelectionPanelRow
                  variant="input-replica"
                  title={item.name}
                  description={item.description}
                  icon={item.icon}
                  right={item.suffix}
                  active={active}
                  selected={selected}
                  menu={item.kind === 'menu'}
                  disabled={item.disabled}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseDown={(event) => {
                    // 用 mouse down 提前接管，避免输入框失焦导致面板闪退。
                    event.preventDefault();
                    onSelectItem(item);
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <SelectionPanelEmpty
          title={activeMenu.emptyTitle ?? emptyTitleFallback}
          description={activeMenu.emptyDesc}
          variant="input-replica"
        />
      )}

      <SelectionPanelHintBar
        label={activeMenu.title}
        hints={hints}
        variant="input-replica"
      />
    </div>
  );
}
