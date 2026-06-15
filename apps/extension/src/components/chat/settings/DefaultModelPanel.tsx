/**
 * 说明：`DefaultModelPanel` 组件模块。
 */
import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, ChevronsUpDown, Headphones, Image, Languages, MessageSquareText, Mic, ScanText } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProviderIcon } from '@/components/ui/ProviderIcon'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore'
import { useModelOptions, type ModelOption } from '@/hooks/useModelOptions'
import { defaultChatModelFilter, isDedicatedImageModelLike, isSpeechModelLike, isTranscriptionModelLike, isVisionModelLike } from '@/lib/ai/model-filters'
import { supportsImageProvider, supportsSpeechProvider, supportsTranscriptionProvider } from '@/lib/ai/provider-capabilities'
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta'
import { cn } from '@/lib/utils'
import type { ChatSettings } from '@/types/chat'
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout'

type PickerTarget = 'default' | 'image' | 'transcription' | 'speech' | 'topic' | 'translate' | 'ocr'
interface ModelPickerButtonProps {
  slotId: PickerTarget
  icon: ReactNode
  modelId: string
  modelLabel: string
  providerId: string
  providerName?: string
  providerLogo?: string
  isInheriting?: boolean
  disabled?: boolean
  onSelect: () => void
}
interface ModelSectionProps extends ModelPickerButtonProps {
  title: string
  description: string
  iconClassName?: string
  canInherit?: boolean
  onToggleInherit?: (inherit: boolean) => void
}
type SettingLeadProps = {
  icon: ReactNode
  title: string
  description: string
  iconClassName?: string
}
type PromptFieldCardProps = {
  icon: ReactNode
  title: string
  description: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  iconClassName?: string
}
type TextSettingSectionProps = {
  icon: ReactNode
  title: string
  description: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  iconClassName?: string
}

const PANEL_CONTROL_FOCUS_CLASS_NAME =
  'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0'

/** 设置项左侧说明块。 */
function SettingLead({ icon, title, description, iconClassName }: SettingLeadProps) {
  return (
    <div className="settings-responsive-lead flex min-w-0 items-start gap-2">
      <div className={cn('mt-0.5 shrink-0 text-muted-foreground', iconClassName)}>{icon}</div>
      <div className="min-w-0">
        <Label className="text-sm">{title}</Label>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

/** 模型选择按钮。 */
function ModelPickerButton({
  slotId,
  icon,
  modelId,
  modelLabel,
  providerId,
  providerName,
  providerLogo,
  isInheriting,
  disabled,
  onSelect,
}: ModelPickerButtonProps) {
  const { t } = useTranslation()
  const ui = pickProviderUiMeta(providerId)
  const hasModel = modelId.trim().length > 0
  const selectionSubtitle = isInheriting
    ? t('defaultModelPanel.useDefaultModel')
    : hasModel
      ? providerName || providerId
      : t('common.notSet')

  return (
    <button
      type="button"
      data-testid={`default-model-panel-select-${slotId}`}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex h-8 min-w-0 w-full items-center justify-between gap-2 rounded-md border border-input',
        'bg-background px-3 text-left text-xs transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none',
        PANEL_CONTROL_FOCUS_CLASS_NAME,
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {hasModel ? (
          <ProviderIcon
            providerId={providerId}
            customLogo={providerLogo}
            fallbackIcon={ui.icon}
            fallbackColor={ui.color}
            size="xs"
          />
        ) : (
          <span className="shrink-0 text-muted-foreground">{icon}</span>
        )}
        <span className={cn('min-w-0 flex-1 truncate', hasModel ? 'text-foreground' : 'text-muted-foreground')}>
          {hasModel ? modelLabel : t('defaultModelPanel.selectModel')}
        </span>
        <span className="sr-only">{selectionSubtitle}</span>
      </span>
      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </button>
  )
}

/** 模型设置行。 */
function ModelSection({
  slotId,
  icon,
  iconClassName,
  title,
  description,
  modelId,
  modelLabel,
  providerId,
  providerName,
  providerLogo,
  canInherit,
  isInheriting,
  onToggleInherit,
  onSelect,
}: ModelSectionProps) {
  const { t } = useTranslation()

  return (
    <section className="settings-responsive-row grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <SettingLead icon={icon} title={title} description={description} iconClassName={iconClassName} />
      <div className="settings-responsive-control grid min-w-0 gap-2 justify-self-end">
        {canInherit ? (
          <div className="settings-responsive-actions flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Label htmlFor={`inherit-${slotId}`} className="cursor-pointer text-xs font-medium text-muted-foreground">
              {t('defaultModelPanel.useDefaultModel')}
            </Label>
            <Switch
              id={`inherit-${slotId}`}
              checked={isInheriting}
              onCheckedChange={(value) => onToggleInherit?.(value)}
            />
          </div>
        ) : null}
        <ModelPickerButton
          slotId={slotId}
          icon={icon}
          modelId={modelId}
          modelLabel={modelLabel}
          providerId={providerId}
          providerName={providerName}
          providerLogo={providerLogo}
          isInheriting={isInheriting}
          disabled={isInheriting}
          onSelect={onSelect}
        />
      </div>
    </section>
  )
}

/** 全局提示词设置区。 */
function PromptFieldCard({
  icon,
  title,
  description,
  placeholder,
  value,
  onChange,
  iconClassName,
}: PromptFieldCardProps) {
  return (
    <section className="space-y-2 py-3 first:pt-0 last:pb-0">
      <SettingLead icon={icon} title={title} description={description} iconClassName={iconClassName} />
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={title}
        className={cn(
          'min-h-[112px] resize-y rounded-md border-input bg-background px-3 py-2 text-sm leading-6',
          PANEL_CONTROL_FOCUS_CLASS_NAME,
        )}
      />
    </section>
  )
}

/** 文本设置行。 */
function TextSettingSection({
  icon,
  title,
  description,
  value,
  placeholder,
  onChange,
  iconClassName,
}: TextSettingSectionProps) {
  return (
    <section className="settings-responsive-row grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <SettingLead icon={icon} title={title} description={description} iconClassName={iconClassName} />
      <div className="settings-responsive-control w-full justify-self-end">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={title}
          className={cn(
            'h-8 rounded-md border-input bg-background px-3 text-xs',
            PANEL_CONTROL_FOCUS_CLASS_NAME,
          )}
        />
      </div>
    </section>
  )
}

/** 模型与提示设置面板：维护默认模型、默认朗读 voice 和全局提示词，不改变模型筛选、持久化或运行时协议。 */
export function DefaultModelPanel() {
  const { t } = useTranslation()

  const { settings, setSettings } = useChatSettingsStore(
    (state) => ({ settings: state.settings, setSettings: state.setSettings }),
    shallow,
  )
  const { providers, getModelLabel } = useModelOptions()

  const getProviderLogo = useCallback(
    (providerId: string) => providers.find((provider) => provider.id === providerId)?.logo,
    [providers],
  )
  const getProviderName = useCallback(
    (providerId: string) => providers.find((provider) => provider.id === providerId)?.name,
    [providers],
  )
  /** 从完整模型 ID 提取 Provider ID。 */
  const extractProviderId = (fullId: string) => fullId.split('/')[0] || ''
  const getSlotLabel = useCallback((modelId?: string) => {
    const normalized = String(modelId || '').trim()
    return normalized ? getModelLabel(normalized) : t('defaultModelPanel.selectModel')
  }, [getModelLabel, t])

  const imageModelFilter = useCallback((model: ModelOption) => {
    if (!isDedicatedImageModelLike(model)) return false
    const provider = providers.find((item) => item.id === model.providerId)
    return Boolean(provider && supportsImageProvider(provider))
  }, [providers])

  const transcriptionModelFilter = useCallback((model: ModelOption) => {
    if (!isTranscriptionModelLike(model)) return false
    const provider = providers.find((item) => item.id === model.providerId)
    return Boolean(provider && supportsTranscriptionProvider(provider))
  }, [providers])

  const speechModelFilter = useCallback((model: ModelOption) => {
    if (!isSpeechModelLike(model)) return false
    const provider = providers.find((item) => item.id === model.providerId)
    return Boolean(provider && supportsSpeechProvider(provider))
  }, [providers])

  const ocrModelFilter = useCallback((model: ModelOption) => (
    defaultChatModelFilter(model) && isVisionModelLike(model)
  ), [])

  const defaultModel = settings.defaultModel
  const defaultImageModel = settings.defaultImageModel ?? ''
  const defaultTranscriptionModel = settings.defaultTranscriptionModel ?? ''
  const defaultSpeechModel = settings.defaultSpeechModel ?? ''
  const defaultSpeechVoice = settings.defaultSpeechVoice ?? ''
  const topicModel = settings.topicNamingModel ?? defaultModel
  const translateModel = settings.translateModel ?? defaultModel
  const ocrModel = settings.ocrModel ?? defaultModel

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>('default')

  const openPicker = useCallback((target: PickerTarget) => {
    setPickerTarget(target)
    setPickerOpen(true)
  }, [])

  const handleModelSelect = useCallback((modelId: string) => {
    const patch: Partial<ChatSettings> = {}
    switch (pickerTarget) {
      case 'default':
        patch.defaultModel = modelId
        break
      case 'image':
        patch.defaultImageModel = modelId
        break
      case 'transcription':
        patch.defaultTranscriptionModel = modelId
        break
      case 'speech':
        patch.defaultSpeechModel = modelId
        break
      case 'topic':
        patch.topicNamingModel = modelId
        break
      case 'translate':
        patch.translateModel = modelId
        break
      case 'ocr':
        patch.ocrModel = modelId
        break
    }
    setSettings({ ...settings, ...patch })
    setPickerOpen(false)
  }, [pickerTarget, setSettings, settings])

  const currentPickerValue = pickerTarget === 'default'
    ? defaultModel
    : pickerTarget === 'image'
      ? defaultImageModel
      : pickerTarget === 'transcription'
        ? defaultTranscriptionModel
        : pickerTarget === 'speech'
          ? defaultSpeechModel
        : pickerTarget === 'topic'
          ? topicModel
          : pickerTarget === 'translate'
            ? translateModel
            : ocrModel

  const currentPickerFilter = pickerTarget === 'image'
    ? imageModelFilter
    : pickerTarget === 'transcription'
      ? transcriptionModelFilter
      : pickerTarget === 'speech'
        ? speechModelFilter
        : pickerTarget === 'ocr'
          ? ocrModelFilter
          : defaultChatModelFilter

  return (
    <>
      <SettingsPanelRoot>
        <SettingsPanelScroller>
          <SettingsPanelInset>
            <div className="space-y-6">
              <div>
                <h3 className="mb-1 text-base font-semibold">{t('defaultModelPanel.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('defaultModelPanel.description')}</p>
              </div>

              <div className="divide-y divide-border/70 rounded-lg border border-border bg-card p-4">
                <ModelSection
                  slotId="default"
                  icon={<Bot className="h-4 w-4" />}
                  iconClassName="text-violet-500"
                  title={t('defaultModelPanel.conversationModel')}
                  description={t('defaultModelPanel.conversationModelDesc')}
                  modelId={defaultModel}
                  modelLabel={getSlotLabel(defaultModel)}
                  providerId={extractProviderId(defaultModel)}
                  providerName={getProviderName(extractProviderId(defaultModel))}
                  providerLogo={getProviderLogo(extractProviderId(defaultModel))}
                  onSelect={() => openPicker('default')}
                />

                <ModelSection
                  slotId="image"
                  icon={<Image className="h-4 w-4" />}
                  iconClassName="text-emerald-500"
                  title={t('defaultModelPanel.imageModel')}
                  description={t('defaultModelPanel.imageModelDesc')}
                  modelId={defaultImageModel}
                  modelLabel={getSlotLabel(defaultImageModel)}
                  providerId={extractProviderId(defaultImageModel)}
                  providerName={getProviderName(extractProviderId(defaultImageModel))}
                  providerLogo={getProviderLogo(extractProviderId(defaultImageModel))}
                  onSelect={() => openPicker('image')}
                />

                <ModelSection
                  slotId="transcription"
                  icon={<Mic className="h-4 w-4" />}
                  iconClassName="text-blue-500"
                  title={t('defaultModelPanel.transcriptionModel')}
                  description={t('defaultModelPanel.transcriptionModelDesc')}
                  modelId={defaultTranscriptionModel}
                  modelLabel={getSlotLabel(defaultTranscriptionModel)}
                  providerId={extractProviderId(defaultTranscriptionModel)}
                  providerName={getProviderName(extractProviderId(defaultTranscriptionModel))}
                  providerLogo={getProviderLogo(extractProviderId(defaultTranscriptionModel))}
                  onSelect={() => openPicker('transcription')}
                />

                <ModelSection
                  slotId="ocr"
                  icon={<ScanText className="h-4 w-4" />}
                  iconClassName="text-indigo-500"
                  title={t('defaultModelPanel.ocrModel')}
                  description={t('defaultModelPanel.ocrModelDesc')}
                  modelId={ocrModel}
                  modelLabel={getSlotLabel(ocrModel)}
                  providerId={extractProviderId(ocrModel)}
                  providerName={getProviderName(extractProviderId(ocrModel))}
                  providerLogo={getProviderLogo(extractProviderId(ocrModel))}
                  canInherit
                  isInheriting={settings.ocrModel === undefined}
                  onToggleInherit={(inherit) => {
                    setSettings({
                      ...settings,
                      ocrModel: inherit ? undefined : defaultModel,
                    })
                  }}
                  onSelect={() => openPicker('ocr')}
                />

                <ModelSection
                  slotId="speech"
                  icon={<Headphones className="h-4 w-4" />}
                  iconClassName="text-amber-500"
                  title={t('defaultModelPanel.speechModel')}
                  description={t('defaultModelPanel.speechModelDesc')}
                  modelId={defaultSpeechModel}
                  modelLabel={getSlotLabel(defaultSpeechModel)}
                  providerId={extractProviderId(defaultSpeechModel)}
                  providerName={getProviderName(extractProviderId(defaultSpeechModel))}
                  providerLogo={getProviderLogo(extractProviderId(defaultSpeechModel))}
                  onSelect={() => openPicker('speech')}
                />

                <TextSettingSection
                  icon={<Headphones className="h-4 w-4" />}
                  iconClassName="text-amber-500"
                  title={t('defaultModelPanel.speechVoice')}
                  description={t('defaultModelPanel.speechVoiceDesc')}
                  value={defaultSpeechVoice}
                  placeholder={t('defaultModelPanel.speechVoicePlaceholder')}
                  onChange={(value) => {
                    setSettings({ ...settings, defaultSpeechVoice: value })
                  }}
                />

                <ModelSection
                  slotId="topic"
                  icon={<MessageSquareText className="h-4 w-4" />}
                  iconClassName="text-sky-500"
                  title={t('defaultModelPanel.topicNamingModel')}
                  description={t('defaultModelPanel.topicNamingModelDesc')}
                  modelId={topicModel}
                  modelLabel={getSlotLabel(topicModel)}
                  providerId={extractProviderId(topicModel)}
                  providerName={getProviderName(extractProviderId(topicModel))}
                  providerLogo={getProviderLogo(extractProviderId(topicModel))}
                  canInherit
                  isInheriting={settings.topicNamingModel === undefined}
                  onToggleInherit={(inherit) => {
                    setSettings({
                      ...settings,
                      topicNamingModel: inherit ? undefined : defaultModel,
                    })
                  }}
                  onSelect={() => openPicker('topic')}
                />

                <ModelSection
                  slotId="translate"
                  icon={<Languages className="h-4 w-4" />}
                  iconClassName="text-cyan-500"
                  title={t('defaultModelPanel.translateModel')}
                  description={t('defaultModelPanel.translateModelDesc')}
                  modelId={translateModel}
                  modelLabel={getSlotLabel(translateModel)}
                  providerId={extractProviderId(translateModel)}
                  providerName={getProviderName(extractProviderId(translateModel))}
                  providerLogo={getProviderLogo(extractProviderId(translateModel))}
                  canInherit
                  isInheriting={settings.translateModel === undefined}
                  onToggleInherit={(inherit) => {
                    setSettings({
                      ...settings,
                      translateModel: inherit ? undefined : defaultModel,
                    })
                  }}
                  onSelect={() => openPicker('translate')}
                />
              </div>

              <div className="divide-y divide-border/70 rounded-lg border border-border bg-card p-4">
                <PromptFieldCard
                  icon={<MessageSquareText className="h-4 w-4" />}
                  iconClassName="text-sky-500"
                  title={t('defaultModelPanel.globalChatPrompt')}
                  description={t('defaultModelPanel.globalChatPromptDesc')}
                  placeholder={t('defaultModelPanel.globalChatPromptPlaceholder')}
                  value={settings.defaultSystemPrompt}
                  onChange={(value) => {
                    setSettings({ ...settings, defaultSystemPrompt: value })
                  }}
                />

                <PromptFieldCard
                  icon={<Image className="h-4 w-4" />}
                  iconClassName="text-emerald-500"
                  title={t('defaultModelPanel.globalImagePrompt')}
                  description={t('defaultModelPanel.globalImagePromptDesc')}
                  placeholder={t('defaultModelPanel.globalImagePromptPlaceholder')}
                  value={settings.defaultImagePromptPrefix}
                  onChange={(value) => {
                    setSettings({ ...settings, defaultImagePromptPrefix: value })
                  }}
                />
              </div>
            </div>
          </SettingsPanelInset>
        </SettingsPanelScroller>
      </SettingsPanelRoot>

      <ModelPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={currentPickerValue}
        onSelect={handleModelSelect}
        filter={currentPickerFilter}
      />
    </>
  )
}
