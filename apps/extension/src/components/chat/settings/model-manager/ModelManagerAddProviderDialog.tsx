/**
 * 说明：`ModelManagerAddProviderDialog` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerAddProviderDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerAddProviderDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { ModelManagerAddProviderDialogProps } from './model-manager-types';
import { ModelManagerAddProviderAvatarPicker } from './ModelManagerAddProviderAvatarPicker';
import { ModelManagerAddProviderBasicFields } from './ModelManagerAddProviderBasicFields';
import { ModelManagerApiKeyAuthSection } from './ModelManagerApiKeyAuthSection';
import { BedrockSection, VertexSection } from './ModelManagerAddProviderCloudSections';
import {
  AnthropicCacheControlSection,
  CompatibilityGrid,
  Field,
  ServiceTierVerbosity,
} from './ModelManagerAddProviderSections';
import { getProviderAdvancedVisibility } from './provider-form';

/** Add Provider 对话框。 */
export function ModelManagerAddProviderDialog(props: ModelManagerAddProviderDialogProps) {
  const {
    open,
    editingProviderId,
    addProviderForm,
    advancedOpen,
    builtinPicker,
    builtinIcons,
    onOpenChange,
    onAdvancedToggle,
    onFormPatch,
    onSave,
    onCancel,
    isSaveDisabled,
    onRequestBuiltinIcons,
    onSelectBuiltinIcon,
    onBuiltinSearch,
    onResetLogo,
    avatarInputRef,
    onAvatarUpload,
    onToggleBuiltinPicker,
  } = props;
  const { t } = useTranslation();
  const advancedVisibility = getProviderAdvancedVisibility(addProviderForm.type, addProviderForm.authType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(92vw,56rem)] max-w-2xl p-0 flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 shrink-0 border-b border-border/60">
          <DialogTitle className="text-lg font-semibold">
            {editingProviderId
              ? t('modelManagerPanel.addProviderDialog.editTitle')
              : t('modelManagerPanel.addProviderDialog.title')}
          </DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          {t('modelManagerPanel.addProviderDialog.description')}
        </DialogDescription>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <ModelManagerAddProviderAvatarPicker
              providerName={addProviderForm.name}
              previewProviderId={editingProviderId ?? undefined}
              logo={addProviderForm.logo}
              builtinPicker={builtinPicker}
              builtinIcons={builtinIcons}
              avatarInputRef={avatarInputRef}
              onToggleBuiltinPicker={onToggleBuiltinPicker}
              onRequestBuiltinIcons={onRequestBuiltinIcons}
              onBuiltinSearch={onBuiltinSearch}
              onSelectBuiltinIcon={onSelectBuiltinIcon}
              onAvatarUpload={onAvatarUpload}
              onResetLogo={onResetLogo}
            />

            <ModelManagerAddProviderBasicFields
              form={addProviderForm}
              onFormPatch={onFormPatch}
            />

            <Collapsible open={advancedOpen} onOpenChange={onAdvancedToggle}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent/30"
                >
                  <span>{t('modelManagerPanel.advanced.title')}</span>
                  {advancedOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                {advancedVisibility.showAnthropicApiHost ? (
                  <Field
                    label={t('modelManagerPanel.addProviderDialog.fields.anthropicApiHost')}
                    description={t('modelManagerPanel.addProviderDialog.fields.anthropicApiHostHint')}
                  >
                    <Input
                      value={addProviderForm.anthropicApiHost}
                      onChange={(event) => onFormPatch({ anthropicApiHost: event.target.value })}
                      placeholder={t('modelManagerPanel.addProviderDialog.fields.anthropicApiHostPlaceholder')}
                      className="h-9 text-sm font-mono"
                    />
                  </Field>
                ) : null}
                {advancedVisibility.showApiKeyAuth ? (
                  <ModelManagerApiKeyAuthSection
                    value={addProviderForm.apiKeyAuth}
                    onChange={(value) => onFormPatch({ apiKeyAuth: value })}
                  />
                ) : null}
                {advancedVisibility.showApiOptions ? (
                  <CompatibilityGrid
                    apiOptions={addProviderForm.apiOptions}
                    onPatch={(patch) =>
                      onFormPatch({
                        apiOptions: { ...(addProviderForm.apiOptions ?? {}), ...patch },
                      })
                    }
                  />
                ) : null}
                {advancedVisibility.showServiceTierVerbosity ? (
                  <ServiceTierVerbosity
                    serviceTier={addProviderForm.serviceTier}
                    verbosity={addProviderForm.verbosity}
                    onServiceTier={(value) => onFormPatch({ serviceTier: value })}
                    onVerbosity={(value) => onFormPatch({ verbosity: value })}
                  />
                ) : null}
                {advancedVisibility.showAnthropicCache ? (
                  <AnthropicCacheControlSection
                    control={addProviderForm.anthropicCacheControl}
                    onPatch={(value) => onFormPatch({ anthropicCacheControl: value })}
                  />
                ) : null}
                {advancedVisibility.showBedrock ? (
                  <BedrockSection
                    bedrock={addProviderForm.bedrock}
                    onPatch={(value) => onFormPatch({ bedrock: value })}
                  />
                ) : null}
                {advancedVisibility.showVertex ? (
                  <VertexSection
                    providerType={addProviderForm.type}
                    vertex={addProviderForm.vertex}
                    onPatch={(value) => onFormPatch({ vertex: value })}
                  />
                ) : null}
                <Field label={t('modelManagerPanel.notes.title')}>
                  <Textarea
                    value={addProviderForm.notes}
                    onChange={(event) => onFormPatch({ notes: event.target.value })}
                    placeholder={t('modelManagerPanel.notes.placeholder')}
                    className="min-h-[96px] text-sm"
                  />
                </Field>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onSave}
            disabled={isSaveDisabled}
          >
            {editingProviderId ? t('common.save') : t('modelManagerPanel.actions.add')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
