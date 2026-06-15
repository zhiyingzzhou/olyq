/**
 * 说明：`ModelPickerDialogImpl` 组件模块。
 *
 * 职责：
 * - 承载 `ModelPickerDialogImpl` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelPickerDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ModelPickerHeader } from '@/components/chat/model-picker/ModelPickerHeader';
import { ModelPickerList } from '@/components/chat/model-picker/ModelPickerList';
import { useModelPickerController } from '@/components/chat/model-picker/useModelPickerController';
import { cn } from '@/lib/utils';
import type { ModelPickerDialogMultiProps, ModelPickerDialogProps } from '@/components/chat/model-picker/shared';

/**
 * 选择模型弹窗（SelectModelPopup）
 *
 * 该组件的目标是实现的核心交互：
 * - 顶部搜索（默认聚焦）
 * - 模型类型筛选（按 8 类用户模型类型过滤：文本生成/图片生成/视觉/推理/工具/联网/向量/重排）
 * - Provider 分组 + Sticky header
 * - 置顶模型分组（仅在"未搜索"时展示）
 * - 键盘导航（↑↓/PgUp/PgDn/Enter/Escape）与自动滚动到聚焦项
 *
 * 设计原则：
 * - "交互一致"优先于"代码复用"：所有关键行为都要可读、可维护
 * - UI 侧只依赖 chrome.storage.local（并提供 localStorage 兜底，便于 Web 预览）
 */
export function ModelPickerDialog(props: ModelPickerDialogProps) {
  const {
    open,
    onClose,
    title,
    description,
    contentClassName,
    onOpenModelManager,
  } = props;
  const { t } = useTranslation();
  const showModelTypeFilter = props.showModelTypeFilter !== false;
  const multiple = props.multiple === true;
  const hideMultiStatusBar = multiple ? Boolean((props as ModelPickerDialogMultiProps).hideMultiStatusBar) : false;
  const footer = multiple ? (props as ModelPickerDialogMultiProps).footer : undefined;

  const {
    listboxId,
    listRef,
    searchText,
    activeModelType,
    activeProvider,
    focusedKey,
    availableProviders,
    availableModelTypes,
    listItems,
    emptyStateDescription,
    selectedSize,
    getProviderLogo,
    handleNavigationKey,
    setSearchText,
    setActiveProvider,
    setActiveModelType,
    setFocusedItemKey,
    clearMouseFocusedItemKey,
    pickModel,
    renderModelCapabilityChips,
    clearSelection,
    togglePinnedModel,
    markUserScrolled,
    multiProps,
  } = useModelPickerController({ props });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className={cn('max-w-2xl p-0 overflow-hidden', contentClassName)}>
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">{title || t('modelSelect.title')}</DialogTitle>
          <DialogDescription className={cn('text-xs text-muted-foreground', description ? '' : 'sr-only')}>
            {description || t('modelSelect.title')}
          </DialogDescription>
        </DialogHeader>

        <ModelPickerHeader
          listboxId={listboxId}
          searchText={searchText}
          focusedKey={focusedKey}
          activeProvider={activeProvider}
          activeModelType={activeModelType}
          showModelTypeFilter={showModelTypeFilter}
          multiple={multiple}
          hideMultiStatusBar={hideMultiStatusBar}
          selectedSize={selectedSize}
          availableProviders={availableProviders}
          availableModelTypes={availableModelTypes}
          getProviderLogo={getProviderLogo}
          onHandleNavigationKey={handleNavigationKey}
          onSetSearchText={setSearchText}
          onSetActiveProvider={setActiveProvider}
          onSetActiveModelType={setActiveModelType}
          onClearSelection={clearSelection}
          onClose={onClose}
          multiProps={multiProps}
        />

        <ModelPickerList
          listRef={listRef}
          listboxId={listboxId}
          title={title || t('modelSelect.title')}
          multiple={multiple}
          focusedKey={focusedKey}
          listItems={listItems}
          emptyStateDescription={emptyStateDescription}
          footer={footer}
          getProviderLogo={getProviderLogo}
          renderCapabilityChips={renderModelCapabilityChips}
          onSetFocusedItemKey={setFocusedItemKey}
          onClearMouseFocusedItemKey={clearMouseFocusedItemKey}
          onPickModel={pickModel}
          onOpenModelManager={onOpenModelManager}
          onTogglePinnedModel={togglePinnedModel}
          onUserScroll={markUserScrolled}
        />
      </DialogContent>
    </Dialog>
  );
}

export default ModelPickerDialog;
