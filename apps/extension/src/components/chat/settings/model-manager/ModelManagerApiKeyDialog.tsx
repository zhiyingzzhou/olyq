/**
 * 说明：`ModelManagerApiKeyDialog` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerApiKeyDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerApiKeyDialogProps`、`ModelManagerApiKeyDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  HeartPulse,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { formatI18nText } from '@/lib/i18n/format';
import {
  InlineErrorDetails,
  isImeComposingLikeEvent,
  maskApiKeyForUi,
  type ApiKeyConnectivityState,
  type ApiKeyEditingState,
  type ApiKeyModelCandidate,
} from '@/components/chat/settings/model-manager/shared';

/** API key 列表弹窗 props。 */
export interface ModelManagerApiKeyDialogProps {
  /** 对话框是否打开。 */
  readonly open: boolean;
  /** 当前 Provider 的展示名。 */
  readonly providerName: string;
  /** 外层维护的 API key 列表弹窗开关。 */
  readonly apiKeyListOpen: boolean;
  /** 当前编辑中的 key 状态；为空表示未处于编辑流程。 */
  readonly apiKeyEditing: ApiKeyEditingState | null;
  /** 编辑态是否以明文显示 key。 */
  readonly apiKeyEditingVisible: boolean;
  /** 已配置的 API key 列表。 */
  readonly apiKeys: ReadonlyArray<string>;
  /** 每个 key 的连通性检查结果。 */
  readonly apiKeyConnectivity: Readonly<Record<string, ApiKeyConnectivityState>>;
  /** 运行连通性检查时选中的模型 ID。 */
  readonly apiKeyCheckModelId: string;
  /** 可用于检查的候选模型列表。 */
  readonly apiKeyCheckModelCandidates: ReadonlyArray<ApiKeyModelCandidate>;
  /** 当前是否至少有一个 key 正在检查。 */
  readonly isAnyApiKeyChecking: boolean;
  /** 被判定为无效的 key 数量。 */
  readonly invalidApiKeyCount: number;
  /** 外层收口回调。 */
  readonly onClose: () => void;
  /** 更新对话框开关。 */
  readonly onSetOpen: (open: boolean) => void;
  /** 开始新增 key。 */
  readonly onBeginAddApiKey: () => void;
  /** 进入某一行 key 的编辑态。 */
  readonly onBeginEditApiKey: (index: number) => void;
  /** 取消当前编辑。 */
  readonly onCancelEdit: () => void;
  /** 保存当前编辑内容。 */
  readonly onSaveEdit: () => void;
  /** 更新当前编辑中的原始输入文本。 */
  readonly onSetEditingValue: (value: string) => void;
  /** 切换编辑态明文/掩码显示。 */
  readonly onToggleEditingVisibility: () => void;
  /** 对全部 key 发起连通性检查。 */
  readonly onRunAllChecks: () => void;
  /** 对单个 key 发起连通性检查。 */
  readonly onRunCheck: (index: number) => void;
  /** 移除所有无效 key。 */
  readonly onRemoveInvalid: () => void;
  /** 删除指定位置的 key。 */
  readonly onRemoveAt: (index: number) => void;
  /** 复制指定 key。 */
  readonly onCopyKey: (key: string) => void;
  /** 更新当前用于检查的模型 ID。 */
  readonly onSetCheckModelId: (value: string) => void;
  /** 同步外层维护的弹窗开关。 */
  readonly onSetApiKeyListOpen: (open: boolean) => void;
  /** 当前编辑输入框引用，用于自动聚焦。 */
  readonly apiKeyInputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/** API key 对话框组件。 */
export function ModelManagerApiKeyDialog({
  open,
  providerName,
  apiKeyEditing,
  apiKeyEditingVisible,
  apiKeys,
  apiKeyConnectivity,
  apiKeyCheckModelId,
  apiKeyCheckModelCandidates,
  isAnyApiKeyChecking,
  invalidApiKeyCount,
  onClose,
  onSetOpen,
  onBeginAddApiKey,
  onBeginEditApiKey,
  onCancelEdit,
  onSaveEdit,
  onSetEditingValue,
  onToggleEditingVisibility,
  onRunAllChecks,
  onRunCheck,
  onRemoveInvalid,
  onRemoveAt,
  onCopyKey,
  onSetCheckModelId,
  onSetApiKeyListOpen,
  apiKeyInputRef,
}: ModelManagerApiKeyDialogProps) {
  const { t } = useTranslation();

  /** 是否存在可用于“连通性检查”的候选模型。 */
  const hasSelection = apiKeyCheckModelCandidates.length > 0;

  /**
   * 统一关闭对话框。
   *
   * 关闭前如果仍处于编辑态，会先取消编辑，避免把脏输入残留到下次打开。
   */
  const handleClose = () => {
    if (apiKeyEditing) {
      onCancelEdit();
    }
    onSetOpen(false);
    onClose();
  };

  /** 当前是否处于新增或编辑 key 的流程中。 */
  const activeEdit = apiKeyEditing?.mode === 'add' || apiKeyEditing?.mode === 'edit';

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onSetApiKeyListOpen(value);
        if (!value) {
          onCancelEdit();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-6 pb-3 pr-14 text-left">
          <DialogTitle className="text-lg font-semibold">
            {t('modelManagerPanel.apiKey.listTitle')} · {providerName}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">{t('modelManagerPanel.apiKey.listDescription')}</DialogDescription>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">{t('modelManagerPanel.apiKey.checkModel')}</Label>
              <Select
                value={apiKeyCheckModelId}
                onValueChange={(value) => onSetCheckModelId(value)}
                disabled={!hasSelection}
              >
                <SelectTrigger className="h-9 w-64 text-sm">
                  <SelectValue placeholder={t('modelManagerPanel.healthDialog.noModels')} />
                </SelectTrigger>
                <SelectContent>
                  {apiKeyCheckModelCandidates.map((model) => (
                    <SelectItem key={model.id} value={model.id} className="text-sm">
                      {model.name || model.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <TooltipAction tooltip={t('modelManagerPanel.apiKey.removeInvalidTitle')}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={isAnyApiKeyChecking || activeEdit || invalidApiKeyCount === 0}
                  onClick={onRemoveInvalid}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('modelManagerPanel.apiKey.removeInvalid')}
                  {invalidApiKeyCount > 0 ? ` (${invalidApiKeyCount})` : ''}
                </Button>
              </TooltipAction>
              <TooltipAction tooltip={t('modelManagerPanel.apiKey.checkAllTitle')}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={isAnyApiKeyChecking || activeEdit || apiKeys.length === 0 || !hasSelection}
                  onClick={onRunAllChecks}
                >
                  <HeartPulse className="mr-2 h-4 w-4" />
                  {t('modelManagerPanel.apiKey.checkAll')}
                </Button>
              </TooltipAction>
              <Button
                size="sm"
                className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={isAnyApiKeyChecking || activeEdit}
                onClick={onBeginAddApiKey}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('common.add')}
              </Button>
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="max-h-[55vh] overflow-y-auto divide-y divide-border">
              {apiKeyEditing?.mode === 'add' && (
                <div className="flex items-start gap-3 px-4 py-3 bg-muted/10">
                  <Textarea
                    ref={apiKeyInputRef}
                    value={apiKeyEditing.value}
                    onChange={(event) => onSetEditingValue(event.target.value)}
                    rows={2}
                    className={`min-h-[44px] flex-1 resize-none rounded text-sm font-mono leading-6 ${
                      apiKeyEditingVisible ? '' : '[-webkit-text-security:disc]'
                    }`}
                    placeholder={t('modelManagerPanel.apiKey.bulkPlaceholder')}
                    onKeyDown={(event) => {
                      if (isImeComposingLikeEvent(event)) return;
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        onCancelEdit();
                        return;
                      }
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault();
                        onSaveEdit();
                      }
                    }}
                  />
                  <div className="flex items-center gap-1 pt-1">
                    <TooltipAction tooltip={apiKeyEditingVisible ? t('common.hide') : t('common.show')}>
                      <button
                        type="button"
                        className="rounded p-2 hover:bg-accent text-muted-foreground"
                        onClick={onToggleEditingVisibility}
                      >
                        {apiKeyEditingVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </TooltipAction>
                    <TooltipAction tooltip={t('common.add')}>
                      <button
                        type="button"
                        className="rounded p-2 hover:bg-accent text-muted-foreground"
                        onClick={onSaveEdit}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </TooltipAction>
                    <TooltipAction tooltip={t('common.cancel')}>
                      <button
                        type="button"
                        className="rounded p-2 hover:bg-accent text-muted-foreground"
                        onClick={onCancelEdit}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TooltipAction>
                  </div>
                </div>
              )}

              {apiKeys.length === 0 ? (
                apiKeyEditing?.mode === 'add' ? null : (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    {t('modelManagerPanel.apiKey.empty')}
                  </div>
                )
              ) : (
                apiKeys.map((key, index) => {
                  const state = apiKeyConnectivity[key] ?? { status: 'not_checked' };
                  const stateErrorText = state.error ? formatI18nText(t, state.error) : '';
                  const stateErrorSummary = stateErrorText || (
                    typeof state.errorDetail === 'string' && state.errorDetail.trim()
                      ? state.errorDetail.trim()
                      : ''
                  );
                  const stateErrorDetail = typeof state.errorDetail === 'string' && state.errorDetail.trim()
                    ? state.errorDetail.trim()
                    : stateErrorSummary;
                  const isEditingRow = apiKeyEditing?.mode === 'edit' && apiKeyEditing.index === index;
                  const isCheckingRow = state.status === 'checking';
                  return (
                    <div key={`${index}-${maskApiKeyForUi(key)}`} className="flex items-center gap-3 px-4 py-2.5">
                      {isEditingRow ? (
                        <>
                          <Textarea
                            ref={apiKeyInputRef}
                            value={apiKeyEditing.value}
                            onChange={(event) => onSetEditingValue(event.target.value)}
                            rows={2}
                            className={`min-h-[44px] flex-1 resize-none rounded text-sm font-mono leading-6 ${
                              apiKeyEditingVisible ? '' : '[-webkit-text-security:disc]'
                            }`}
                            placeholder={t('modelManagerPanel.apiKey.bulkPlaceholder')}
                            onKeyDown={(event) => {
                              if (isImeComposingLikeEvent(event)) return;
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                onCancelEdit();
                                return;
                              }
                              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                event.preventDefault();
                                onSaveEdit();
                              }
                            }}
                          />
                          <div className="flex items-center gap-1">
                            <TooltipAction tooltip={apiKeyEditingVisible ? t('common.hide') : t('common.show')}>
                              <button
                                type="button"
                                className="rounded p-2 hover:bg-accent text-muted-foreground"
                                onClick={onToggleEditingVisibility}
                              >
                                {apiKeyEditingVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </TooltipAction>
                            <TooltipAction tooltip={t('common.save')}>
                              <button
                                type="button"
                                className="rounded p-2 hover:bg-accent text-muted-foreground"
                                onClick={onSaveEdit}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </TooltipAction>
                            <TooltipAction tooltip={t('common.cancel')}>
                              <button
                                type="button"
                                className="rounded p-2 hover:bg-accent text-muted-foreground"
                                onClick={onCancelEdit}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TooltipAction>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-olyq-api-key-row="meta">
                              <span className="truncate text-xs font-mono" title={maskApiKeyForUi(key)}>
                                {maskApiKeyForUi(key)}
                              </span>
                              {state.status === 'checking' ? (
                                <span data-olyq-api-key-status="indicator" className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-muted-foreground/40" />
                              ) : (
                                <span data-olyq-api-key-status="indicator" className={`h-2 w-2 flex-shrink-0 rounded-full ${
                                  state.status === 'success'
                                    ? 'bg-emerald-500'
                                    : state.status === 'failed'
                                      ? 'bg-red-500'
                                      : 'bg-muted-foreground/40'
                                }`} />
                              )}
                              {typeof state.latency === 'number' && state.status === 'success' && (
                                <span className="text-xs text-muted-foreground tabular-nums">{Math.round(state.latency)}ms</span>
                              )}
                              {state.status === 'failed' && stateErrorSummary ? (
                                <InlineErrorDetails
                                  summary={stateErrorSummary}
                                  detail={stateErrorDetail}
                                  summaryClassName="text-[11px] text-destructive max-w-[260px]"
                                  buttonClassName="text-destructive hover:text-destructive"
                                />
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <TooltipAction tooltip={t('common.copy')}>
                              <button
                                type="button"
                                className="rounded p-2 hover:bg-accent text-muted-foreground"
                                disabled={activeEdit}
                                onClick={() => onCopyKey(key)}
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </TooltipAction>
                            <TooltipAction tooltip={t('modelManagerPanel.apiKey.checkOne')}>
                              <button
                                type="button"
                                className="rounded p-2 hover:bg-accent text-muted-foreground"
                                disabled={isAnyApiKeyChecking || activeEdit || isCheckingRow || !hasSelection}
                                onClick={() => onRunCheck(index)}
                              >
                                <HeartPulse className="h-4 w-4" />
                              </button>
                            </TooltipAction>
                            <TooltipAction tooltip={t('common.edit')}>
                              <button
                                type="button"
                                className="rounded p-2 hover:bg-accent text-muted-foreground"
                                disabled={isAnyApiKeyChecking || activeEdit}
                                onClick={() => onBeginEditApiKey(index)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </TooltipAction>
                            <TooltipAction tooltip={t('common.delete')}>
                              <button
                                type="button"
                                className="rounded p-2 hover:bg-destructive/10 text-muted-foreground"
                                disabled={isAnyApiKeyChecking || activeEdit}
                                onClick={() => onRemoveAt(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TooltipAction>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('modelManagerPanel.apiKey.rotationHint')}</p>
        </div>

        <div className="px-6 py-4 border-t border-border/60 flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
