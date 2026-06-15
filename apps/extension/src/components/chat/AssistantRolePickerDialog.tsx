/**
 * 说明：`AssistantRolePickerDialog` 组件模块。
 *
 * 职责：
 * - 承载助手侧栏“创建助手”使用的轻量选择弹窗；
 * - 只展示内置预设分区，供用户快速点选并直接创建助手实例；
 * - 保留浏览器分区固定排序和通用分区分类筛选，不混入完整商店的管理能力。
 *
 * 边界：
 * - 本组件不承载用户预设 CRUD、导入导出或批量管理；
 * - 不新增 `/store` 页面，也不与完整 `AssistantStoreDialog` 复用同一套入口语义。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AssistantPreset } from '@/types/assistant';
import { BUILTIN_DEFAULT_ROLE_TEMPLATE_ID } from '@/types/assistant';
import type { AssistantPresetSection, PresetLibrarySectionKey } from '@/data/role-templates';

import { AssistantBrowserPresetCard } from './AssistantBrowserPresetCard';
import { AssistantGeneralPresetCard } from './AssistantGeneralPresetCard';
import { sortBrowserPresetItems } from './assistant-preset-order';
import { ASSISTANT_GENERAL_STATIC_GRID_CLASS } from './assistant-preset-grid';

/** 助手侧栏快速创建使用的轻量选择弹窗入参。 */
export interface AssistantRolePickerDialogProps {
  /** 是否打开。 */
  open: boolean;
  /** 内置预设全集。 */
  templates: AssistantPreset[];
  /** 内置预设分区。 */
  sections: AssistantPresetSection[];
  /** 关闭弹窗。 */
  onClose: () => void;
  /** 点选预设后立即创建助手。 */
  onSelectTemplate: (templateId: string) => void;
}

const ROLE_PICKER_VIRTUALIZATION_THRESHOLD = 80;
const ROLE_PICKER_CARD_MIN_HEIGHT_PX = 88;
const ROLE_PICKER_VIRTUAL_ROW_HEIGHT_PX = ROLE_PICKER_CARD_MIN_HEIGHT_PX + 8;
const ROLE_PICKER_DEFAULT_SECTION_KEY: PresetLibrarySectionKey = 'general';
const ROLE_PICKER_SECTION_ORDER: PresetLibrarySectionKey[] = ['general', 'browser'];

/** 根据当前视口宽度解析轻量角色选择器的列数。 */
function resolveRolePickerColumnCount(width: number) {
  if (width >= 980) return 3;
  if (width >= 640) return 2;
  return 1;
}

/** 把预设列表按当前列数打包成虚拟列表逐行渲染模型。 */
function packRolePickerRows<T>(items: ReadonlyArray<T>, columnCount: number): T[][] {
  const next: T[][] = [];
  for (let index = 0; index < items.length; index += columnCount) {
    next.push(items.slice(index, index + columnCount));
  }
  return next;
}

/** 按轻量创建入口的信息架构排序分区：通用助手优先，浏览器任务作为第二组。 */
function sortRolePickerSections(sections: ReadonlyArray<AssistantPresetSection>): AssistantPresetSection[] {
  const order = new Map(ROLE_PICKER_SECTION_ORDER.map((key, index) => [key, index]));
  return [...sections].sort((left, right) => {
    const leftRank = order.get(left.key) ?? ROLE_PICKER_SECTION_ORDER.length;
    const rightRank = order.get(right.key) ?? ROLE_PICKER_SECTION_ORDER.length;
    return leftRank - rightRank;
  });
}

/**
 * 助手侧栏“创建助手”的轻量角色选择器。
 *
 * @remarks
 * 它只负责“从内置预设快速创建助手”这一条高频路径；
 * 启动台里的“助手商店”仍由完整 `AssistantStoreDialog` 承载。
 */
export function AssistantRolePickerDialog({
  open,
  templates,
  sections,
  onClose,
  onSelectTemplate,
}: AssistantRolePickerDialogProps) {
  const { t } = useTranslation();
  const gridViewportRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [activeSectionKey, setActiveSectionKey] = useState<PresetLibrarySectionKey>(ROLE_PICKER_DEFAULT_SECTION_KEY);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setActiveSectionKey(ROLE_PICKER_DEFAULT_SECTION_KEY);
    setActiveCategory('all');
  }, [open]);

  const builtinDefaultTemplate = useMemo(
    () => templates.find((template) => template.id === BUILTIN_DEFAULT_ROLE_TEMPLATE_ID) ?? null,
    [templates],
  );

  const sectionMap = useMemo(
    () => {
      const next = new Map<PresetLibrarySectionKey, AssistantPresetSection>();
      for (const section of sections) {
        if (section.key !== 'general' || !builtinDefaultTemplate) {
          next.set(section.key, section);
          continue;
        }

        const hasDefaultTemplate = section.presets.some((preset) => preset.id === builtinDefaultTemplate.id);
        next.set(section.key, {
          ...section,
          presets: hasDefaultTemplate ? section.presets : [builtinDefaultTemplate, ...section.presets],
        });
      }
      return next;
    },
    [builtinDefaultTemplate, sections],
  );

  const tabSections = useMemo(
    () => sortRolePickerSections(sections.map((section) => sectionMap.get(section.key) ?? section)),
    [sectionMap, sections],
  );

  const activeSection = sectionMap.get(activeSectionKey) ?? tabSections[0] ?? null;
  const activeSectionDefinition = activeSection ?? tabSections[0] ?? null;

  const filtered = useMemo(() => {
    if (!activeSection) return [];
    let scopedPresets = activeSection.presets;
    if (activeSection.key === 'browser') {
      scopedPresets = sortBrowserPresetItems(scopedPresets);
    } else if (activeCategory !== 'all') {
      scopedPresets = scopedPresets.filter((template) => (template.tags ?? []).includes(activeCategory));
    }
    if (!search.trim()) return scopedPresets;
    const keyword = search.trim().toLowerCase();
    return scopedPresets.filter((template) => (
      template.name.toLowerCase().includes(keyword)
      || (template.description ?? '').toLowerCase().includes(keyword)
      || template.prompt.toLowerCase().includes(keyword)
    ));
  }, [activeCategory, activeSection, search]);
  const gridColumnCount = useMemo(() => resolveRolePickerColumnCount(gridWidth), [gridWidth]);
  const usesVirtualGrid = activeSectionDefinition?.key === 'general' && filtered.length > ROLE_PICKER_VIRTUALIZATION_THRESHOLD;
  const packedGridRows = useMemo(
    () => packRolePickerRows(filtered, gridColumnCount),
    [filtered, gridColumnCount],
  );
  const rowVirtualizer = useVirtualizer({
    count: packedGridRows.length,
    getScrollElement: () => gridViewportRef.current,
    estimateSize: () => ROLE_PICKER_VIRTUAL_ROW_HEIGHT_PX,
    overscan: 6,
    getItemKey: (index) => packedGridRows[index]?.map((template) => template.id).join('|') ?? index,
    initialRect: {
      width: 0,
      height: 640,
    },
  });

  /**
   * 渲染单张预设卡片。
   *
   * 说明：
   * - 轻量选择弹窗保持“点一下直接创建”；
   * - 不像完整商店那样先进入详情预览。
   */
  const renderPresetCard = (
    template: AssistantPreset,
    options?: { featured?: boolean; stretchToRow?: boolean },
  ) => {
    if (template.scenario === 'browser') {
      return (
        <AssistantBrowserPresetCard
          key={template.id}
          preset={template}
          actionLabel={t('assistant.createFromRole')}
          stretchToRow={options?.stretchToRow}
          onClick={onSelectTemplate}
        />
      );
    }

    return (
      <AssistantGeneralPresetCard
        key={template.id}
        preset={template}
        actionLabel={t('assistant.createFromRole')}
        featured={options?.featured}
        stretchToRow={options?.stretchToRow}
        onClick={onSelectTemplate}
      />
    );
  };

  useEffect(() => {
    const element = gridViewportRef.current;
    if (!element) return;

    /** 同步记录虚拟网格当前可用宽度。 */
    const updateWidth = () => {
      setGridWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [open, activeSectionKey]);

  useEffect(() => {
    if (!usesVirtualGrid) return;
    rowVirtualizer.measure();
  }, [gridColumnCount, rowVirtualizer, filtered.length, usesVirtualGrid]);

  useEffect(() => {
    if (!open || !usesVirtualGrid) return;

    // Dialog 从关闭态切到可见时，虚拟列表先前可能还没拿到真实 viewport；
    // 下一帧显式重测，避免首次打开浏览器分区时出现空白，只有切 tab 后才恢复。
    const frameId = window.requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeCategory, activeSectionKey, filtered.length, gridColumnCount, open, rowVirtualizer, search, usesVirtualGrid]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="flex min-h-0 min-w-0 max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 h-[min(80vh,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] w-[min(820px,calc(100vw-1.5rem))]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
          <DialogTitle>{t('assistant.chooseRole')}</DialogTitle>
          <DialogDescription>{t('assistant.chooseRoleDesc')}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeSectionKey}
          onValueChange={(value) => {
            setActiveSectionKey(value as PresetLibrarySectionKey);
            setActiveCategory('all');
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 space-y-3 border-b border-border bg-background px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('assistant.roleSearch')}
                className="h-9 pl-9 text-sm"
              />
            </div>

            <TabsList className="grid h-9 w-full grid-cols-2">
              {tabSections.map((section) => (
                <TabsTrigger key={section.key} value={section.key} className="h-7 text-sm">
                  {t('assistant.roleSectionTab', { title: section.title, count: section.presets.length })}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {activeSectionDefinition ? (
            <TabsContent value={activeSectionDefinition.key} className="mt-0 flex min-h-0 flex-1 flex-col gap-3 px-5 py-3 data-[state=inactive]:hidden">
              {activeSectionDefinition.key === 'general' && (
                <>
                  <div className="sm:hidden">
                    <Select value={activeCategory} onValueChange={setActiveCategory}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('assistant.allCategories')}</SelectItem>
                        {activeSectionDefinition.categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="hidden flex-wrap gap-2 sm:flex">
                    <Button
                      type="button"
                      size="sm"
                      variant={activeCategory === 'all' ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      onClick={() => setActiveCategory('all')}
                    >
                      {t('assistant.allCategories')}
                    </Button>
                    {activeSectionDefinition.categories.map((category) => (
                      <Button
                        key={category}
                        type="button"
                        size="sm"
                        variant={activeCategory === category ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setActiveCategory(category)}
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              <div ref={gridViewportRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
                {filtered.length > 0 ? (
                  usesVirtualGrid ? (
                    <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
                      {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const rowItems = packedGridRows[virtualItem.index] ?? [];
                        return (
                          <div
                            key={virtualItem.key}
                            data-index={virtualItem.index}
                            className="box-border pb-2"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: `${ROLE_PICKER_VIRTUAL_ROW_HEIGHT_PX}px`,
                              transform: `translateY(${virtualItem.start}px)`,
                            }}
                          >
                            <div
                              className="grid h-full gap-2"
                              style={{ gridTemplateColumns: `repeat(${gridColumnCount}, minmax(0, 1fr))` }}
                            >
                              {rowItems.map((template) => renderPresetCard(template, {
                                featured: template.id === BUILTIN_DEFAULT_ROLE_TEMPLATE_ID,
                                stretchToRow: true,
                              }))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : activeSectionDefinition.key === 'general' ? (
                    <div
                      data-testid="assistant-role-picker-general-grid"
                      className={ASSISTANT_GENERAL_STATIC_GRID_CLASS}
                    >
                      {filtered.map((template) => renderPresetCard(template, {
                        featured: template.id === BUILTIN_DEFAULT_ROLE_TEMPLATE_ID,
                      }))}
                    </div>
                  ) : (
                    <div
                      data-testid="assistant-role-picker-browser-grid"
                      className="grid grid-cols-1 gap-2 pb-2 sm:grid-cols-2"
                    >
                      {filtered.map((template) => renderPresetCard(template))}
                    </div>
                  )
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t('assistant.noResults')}
                  </div>
                )}
              </div>
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
