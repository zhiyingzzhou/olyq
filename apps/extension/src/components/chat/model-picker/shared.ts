/**
 * 说明：`shared` 组件模块。
 *
 * 职责：
 * - 承载 `shared` 相关的当前文件实现与模块边界；
 * - 对外暴露 `EMPTY_VALUES`、`PAGE_SIZE`、`PickerGroupItem` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';

import type { ModelOption } from '@/hooks/useModelOptions';
import type { ProviderConfig } from '@/lib/ai/types';

/** 空多选值集合。 */
export const EMPTY_VALUES: string[] = [];

/** 键盘翻页步长。 */
export const PAGE_SIZE = 12;

/** 模型选择器分组项。 */
export interface PickerGroupItem {
  /** 鉴别字段。 */
  readonly type: 'group';
  /** 列表稳定键。 */
  readonly key: string;
  /** 分组显示名称。 */
  readonly name: string;
  /** 可选 provider ID。 */
  readonly providerId?: string;
  /** 可选右侧操作区。 */
  readonly actions?: ReactNode;
}

/** 模型选择器模型项。 */
export interface PickerModelItem {
  /** 鉴别字段。 */
  readonly type: 'model';
  /** 列表稳定键。 */
  readonly key: string;
  /** 完整模型 ID。 */
  readonly id: string;
  /** provider 范围 modelId。 */
  readonly modelId: string;
  /** 展示名称。 */
  readonly name: string;
  /** provider ID。 */
  readonly providerId: string;
  /** provider 展示名。 */
  readonly providerName: string;
  /** provider 类型。 */
  readonly providerType: ModelOption['providerType'];
  /** 分组名称。 */
  readonly group?: string;
  /** 解析后的 kind。 */
  readonly kind: ModelOption['kind'];
  /** 当前主类键。 */
  readonly primaryKindKey: ModelOption['primaryKindKey'];
  /** 解析后的 features。 */
  readonly features: ModelOption['features'];
  /** 是否因已选而被强制展示。 */
  readonly forcedVisible?: boolean;
  /** 是否为置顶项。 */
  readonly isPinned: boolean;
  /** 是否已选中。 */
  readonly isSelected: boolean;
}

/** 模型选择器列表项联合类型。 */
export type PickerItem = PickerGroupItem | PickerModelItem;

/** 模型选择器基础属性。 */
export interface ModelPickerDialogBaseProps {
  /** 是否打开弹窗。 */
  readonly open: boolean;
  /** 关闭弹窗。 */
  readonly onClose: () => void;
  /** 可选标题。 */
  readonly title?: string;
  /** 可选描述。 */
  readonly description?: string;
  /** 可选弹窗 className。 */
  readonly contentClassName?: string;
  /** 可选基础过滤器。 */
  readonly filter?: (m: ModelOption) => boolean;
  /** 是否显示模型类型筛选。 */
  readonly showModelTypeFilter?: boolean;
  /** 打开模型管理回调。 */
  readonly onOpenModelManager?: () => void;
}

/** 模型选择器单选属性。 */
export type ModelPickerDialogSingleProps = ModelPickerDialogBaseProps & {
  /** 单选模式。 */
  readonly multiple?: false;
  /** 当前值。 */
  readonly value: string;
  /** 单选回调。 */
  readonly onSelect: (modelId: string) => void;
};

/** 模型选择器多选属性。 */
export type ModelPickerDialogMultiProps = ModelPickerDialogBaseProps & {
  /** 多选模式。 */
  readonly multiple: true;
  /** 当前值列表。 */
  readonly values: string[];
  /** 多选变更回调。 */
  readonly onChange: (modelIds: string[]) => void;
  /** 是否隐藏默认多选状态栏。 */
  readonly hideMultiStatusBar?: boolean;
  /** 可选 footer。 */
  readonly footer?: ReactNode;
};

/** 模型选择器总属性。 */
export type ModelPickerDialogProps = ModelPickerDialogSingleProps | ModelPickerDialogMultiProps;

/**
 * 标准化搜索词。
 *
 * @param raw - 原始输入。
 * @returns 去首尾空白并统一转为小写后的搜索词。
 */
export function normalizeQuery(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

/**
 * 判断是否处于 IME 组合输入中。
 *
 * @param event - 键盘事件的最小兼容结构。
 * @returns 当用户正在进行中文/日文等输入法合成时返回 `true`。
 */
export function isComposingLikeKeyboardEvent(
  event: {
    readonly isComposing?: boolean;
    readonly key?: string;
    readonly nativeEvent?: {
      readonly isComposing?: boolean;
      readonly keyCode?: number;
    } | null;
  },
) {
  return Boolean(
    event.isComposing
    || event.nativeEvent?.isComposing
    || event.nativeEvent?.keyCode === 229
    || event.key === 'Process',
  );
}

/**
 * 判断事件目标是否为可交互输入元素。
 *
 * @param target - 原始事件目标。
 * @returns 若目标位于 input、textarea、button 等交互元素内，则返回 `true`。
 */
export function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, button, select, [contenteditable="true"], [role="button"]'));
}

/**
 * 判断模型是否匹配当前搜索词。
 *
 * @param m - 模型选项。
 * @param q - 已标准化的搜索词。
 * @returns 当搜索词命中模型名、完整 ID、Provider 名或 Provider ID 时返回 `true`。
 */
export function matchesSearch(m: ModelOption, q: string): boolean {
  if (!q) return true;
  const name = String(m.name || '').toLowerCase();
  const id = String(m.id || '').toLowerCase();
  const provider = String(m.providerName || '').toLowerCase();
  const pid = String(m.providerId || '').toLowerCase();
  return name.includes(q) || id.includes(q) || provider.includes(q) || pid.includes(q);
}

/** 构建模型选择器列表项的输入。 */
export interface BuildPickerListItemsInput {
  /** 全量 provider 列表。 */
  readonly providers: ReadonlyArray<ProviderConfig>;
  /** 全量模型列表。 */
  readonly models: ReadonlyArray<ModelOption>;
  /** 已选模型集合。 */
  readonly selectedSet: ReadonlySet<string>;
  /** 置顶模型集合。 */
  readonly pinnedSet: ReadonlySet<string>;
  /** 基础过滤器。 */
  readonly baseFilter: (model: ModelOption) => boolean;
  /** 搜索词。 */
  readonly normalizedSearchQ: string;
  /** 当前 provider 过滤值。 */
  readonly normalizedActiveProvider: string;
  /** 当前模型类型过滤值。 */
  readonly normalizedActiveModelType: string;
  /** 模型 -\> 模型类型键映射。 */
  readonly modelTypeKeysMap: ReadonlyMap<string, ReadonlyArray<string>>;
  /** “当前选中”分组文案。 */
  readonly currentSelectionLabel: string;
  /** “置顶模型”分组文案。 */
  readonly pinnedLabel: string;
  /** provider 分组右侧动作。 */
  readonly createGroupActions?: (provider: ProviderConfig) => ReactNode;
}

/**
 * 构建模型选择器列表项。
 *
 * 会综合已选模型、置顶模型、搜索词、Provider 筛选和模型类型筛选，
 * 输出带分组头的最终扁平列表。即便某个已选模型当前不满足筛选条件，也会作为
 * `forcedVisible` 项保留在“当前选中”分组中，避免用户丢失已选上下文。
 *
 * @param input - 列表构建所需的全部上下文。
 * @returns 供 model picker 直接渲染的扁平列表项。
 */
export function buildPickerListItems({
  providers,
  models,
  selectedSet,
  pinnedSet,
  baseFilter,
  normalizedSearchQ,
  normalizedActiveProvider,
  normalizedActiveModelType,
  modelTypeKeysMap,
  currentSelectionLabel,
  pinnedLabel,
  createGroupActions,
}: BuildPickerListItemsInput): PickerItem[] {
  const items: PickerItem[] = [];
  /**
   * 汇总最终列表是否应展示某个模型。
   *
   * 说明：
   * - 按顺序叠加基础过滤、搜索词、Provider 和模型类型筛选；
   * - 该判断只用于“常规可见项”，已选但被过滤掉的模型会在后面以 forcedVisible 方式补回。
   */
  const finalFilter = (model: ModelOption) => {
    if (!baseFilter(model)) return false;
    if (!matchesSearch(model, normalizedSearchQ)) return false;
    if (normalizedActiveProvider !== 'all' && model.providerId !== normalizedActiveProvider) return false;
    if (normalizedActiveModelType === 'all') return true;
    const keys = modelTypeKeysMap.get(model.id) ?? [];
    return keys.includes(normalizedActiveModelType);
  };

  const selectedOverflowModels: PickerModelItem[] = [];
  for (const selectedId of selectedSet) {
    const matched = models.find((model) => model.id === selectedId);
    if (matched) {
      if (finalFilter(matched)) continue;
      selectedOverflowModels.push({
        type: 'model',
        key: `${matched.id}__forced-selected`,
        id: matched.id,
        modelId: matched.modelId,
        name: matched.name,
        providerId: matched.providerId,
        providerName: matched.providerName,
        providerType: matched.providerType,
        group: matched.group,
        kind: matched.kind,
        primaryKindKey: matched.primaryKindKey,
        features: matched.features,
        forcedVisible: true,
        isPinned: pinnedSet.has(matched.id),
        isSelected: true,
      });
      continue;
    }

    const [providerId, ...rest] = selectedId.split('/');
    const modelId = rest.join('/') || selectedId;
    const provider = providers.find((item) => item.id === providerId);
    selectedOverflowModels.push({
      type: 'model',
      key: `${selectedId}__forced-missing`,
      id: selectedId,
      modelId,
      name: modelId,
      providerId: providerId || 'unknown',
      providerName: provider?.name || providerId || 'Unknown',
      providerType: (provider?.type || 'openai') as ModelOption['providerType'],
      kind: 'unknown',
      primaryKindKey: 'unknown',
      features: [],
      forcedVisible: true,
      isPinned: false,
      isSelected: true,
    });
  }

  // 搜索态下不再额外置顶“置顶模型”分组，避免结果列表重复且打断搜索相关性。
  if (normalizedSearchQ.length === 0 && pinnedSet.size > 0) {
    const pinnedModels = models
      .filter((model) => pinnedSet.has(model.id))
      .filter(finalFilter)
      .map((model) => ({
        type: 'model',
        key: `${model.id}__pinned`,
        id: model.id,
        modelId: model.modelId,
        name: model.name,
        providerId: model.providerId,
        providerName: model.providerName,
        providerType: model.providerType,
        group: model.group,
        kind: model.kind,
        primaryKindKey: model.primaryKindKey,
        features: model.features,
        forcedVisible: false,
        isPinned: true,
        isSelected: selectedSet.has(model.id),
      }) satisfies PickerModelItem);

    if (pinnedModels.length > 0) {
      items.push({ type: 'group', key: 'pinned-group', name: pinnedLabel });
      items.push(...pinnedModels);
    }
  }

  const enabledProviders = providers.filter((provider) => provider.enabled);
  for (const provider of enabledProviders) {
    const providerModels = models
      .filter((model) => model.providerId === provider.id)
      .filter((model) => normalizedSearchQ.length > 0 || !pinnedSet.has(model.id))
      .filter(finalFilter)
      .slice()
      .sort((left, right) => {
        const leftGroup = String(left.group || '');
        const rightGroup = String(right.group || '');
        if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup);
        return String(left.name || '').localeCompare(String(right.name || ''));
      })
      .map((model) => ({
        type: 'model',
        key: model.id,
        id: model.id,
        modelId: model.modelId,
        name: model.name,
        providerId: model.providerId,
        providerName: model.providerName,
        providerType: model.providerType,
        group: model.group,
        kind: model.kind,
        primaryKindKey: model.primaryKindKey,
        features: model.features,
        forcedVisible: false,
        isPinned: pinnedSet.has(model.id),
        isSelected: selectedSet.has(model.id),
      }) satisfies PickerModelItem);

    if (providerModels.length === 0) continue;

    items.push({
      type: 'group',
      key: `provider-${provider.id}`,
      name: provider.name,
      providerId: provider.id,
      actions: createGroupActions?.(provider),
    });
    items.push(...providerModels);
  }

  if (selectedOverflowModels.length > 0) {
    const selectedOverflowSection: PickerItem[] = [
      { type: 'group', key: 'selected-overflow-group', name: currentSelectionLabel },
      ...selectedOverflowModels,
    ];

    if (normalizedSearchQ.length > 0) {
      items.push(...selectedOverflowSection);
    } else {
      items.unshift(...selectedOverflowSection);
    }
  }

  return items;
}
