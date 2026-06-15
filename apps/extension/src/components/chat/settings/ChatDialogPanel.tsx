/**
 * 说明：`ChatDialogPanel` 组件模块。
 *
 * 职责：
 * - 承载 `ChatDialogPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatDialogPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { type KeyboardEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { shallow } from 'zustand/shallow';
import {
  SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS,
  normalizeSupportedTranslationSelection,
} from '@/lib/chat/translation-languages';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';

/** 聊天导出菜单支持的动作键。 */
const EXPORT_KEYS = [
  { key: 'copy_plain', labelKey: 'message.copyPlain' },
  { key: 'copy_image', labelKey: 'message.copyImage' },
  { key: 'export_image', labelKey: 'message.exportImage' },
  { key: 'markdown', labelKey: 'message.exportMarkdown' },
  { key: 'markdown_reason', labelKey: 'message.exportMarkdownReason' },
  { key: 'word', labelKey: 'message.exportWord' },
] as const;

/** 聊天导出菜单可切换的动作键联合类型。 */
type ExportKey = (typeof EXPORT_KEYS)[number]['key'];

/**
 * 聊天交互设置面板。
 *
 * 集中维护聊天输入、删除确认、翻译语言、导出能力和开发者模式等 UI 偏好。
 * 所有配置都通过 `useChatSettingsStore` 的 `settings` 做受控更新。
 */
export function ChatDialogPanel() {
  const { t } = useTranslation();
  /** 翻译语言多选弹层是否打开。 */
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  /** 翻译语言筛选关键词。 */
  const [languageQuery, setLanguageQuery] = useState('');

  const { settings, setSettings } = useChatSettingsStore((s) => ({
    settings: s.settings,
    setSettings: s.setSettings,
  }), shallow);

  const exportOptions = settings.exportMenuOptions ?? {};

  /**
   * 统一更新聊天设置。
   *
   * @param patch - 要覆盖的设置字段。
   */
  const update = (patch: Partial<typeof settings>) => {
    setSettings({ ...settings, ...patch });
  };

  /**
   * 更新单个导出菜单选项开关。
   *
   * @param k - 导出动作键。
   * @param v - 是否启用。
   */
  const updateExport = (k: ExportKey, v: boolean) => {
    setSettings({
      ...settings,
      exportMenuOptions: { ...(settings.exportMenuOptions ?? {}), [k]: v },
    });
  };

  const langs = useMemo(
    () => normalizeSupportedTranslationSelection({
      languages: settings.translateLanguages,
      targetLanguage: settings.translateTargetLanguage,
      fallbackLanguages: [],
    }),
    [settings.translateLanguages, settings.translateTargetLanguage],
  );

  /** 当前已选择的翻译语言列表。 */
  const selectedTranslateLanguages = langs.languages;
  /** 当前解析后的默认翻译目标语言。 */
  const resolvedTranslateTargetLanguage = langs.targetLanguage ?? '';

  /** 翻译语言搜索过滤后的可选列表。 */
  const filteredLanguageOptions = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();
    if (!query) return SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS;
    return SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS.filter((option) => {
      return option.value.toLowerCase().includes(query)
        || option.searchTerms.some((term) => term.toLowerCase().includes(query));
    });
  }, [languageQuery]);

  /** 翻译语言多选按钮的摘要文案。 */
  const languageSummary = useMemo(() => {
    if (selectedTranslateLanguages.length === 0) return t('chatDialog.translateLanguagesPlaceholder');
    if (selectedTranslateLanguages.length <= 3) return selectedTranslateLanguages.join(', ');
    return `${selectedTranslateLanguages.slice(0, 3).join(', ')} +${selectedTranslateLanguages.length - 3}`;
  }, [selectedTranslateLanguages, t]);

  /**
   * 提交翻译语言列表，并同步修正目标语言。
   *
   * @param nextLanguages - 新的语言列表。
   */
  const commitTranslateLanguages = (nextLanguages: string[]) => {
    const normalized = normalizeSupportedTranslationSelection({
      languages: nextLanguages,
      targetLanguage: settings.translateTargetLanguage,
      fallbackLanguages: [],
    });
    update({
      translateLanguages: normalized.languages,
      translateTargetLanguage: normalized.targetLanguage,
    });
  };

  /**
   * 切换单个翻译语言。
   *
   * @param language - 目标语言。
   */
  const toggleTranslateLanguage = (language: string) => {
    const nextLanguages = selectedTranslateLanguages.includes(language)
      ? selectedTranslateLanguages.filter((item) => item !== language)
      : [...selectedTranslateLanguages, language];
    commitTranslateLanguages(nextLanguages);
  };

  /**
   * 让翻译语言行项在键盘下也保持可切换，并避免无效的 button 嵌套结构。
   *
   * @param event - 当前键盘事件。
   * @param language - 目标语言。
   */
  const handleTranslateLanguageItemKeyDown = (event: KeyboardEvent<HTMLDivElement>, language: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleTranslateLanguage(language);
  };

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">{t('chatDialog.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('chatDialog.description')}</p>
      </div>

      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">{t('chatDialog.sendShortcut')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.sendShortcutDesc')}</p>
          </div>
          <Select
            value={settings.sendMessageShortcut ?? 'enter'}
            onValueChange={(v) => update({ sendMessageShortcut: v as typeof settings.sendMessageShortcut })}
          >
            <SelectTrigger className="w-52 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enter" className="text-xs">{t('chatDialog.shortcutEnter')}</SelectItem>
              <SelectItem value="ctrlEnter" className="text-xs">{t('chatDialog.shortcutCtrlEnter')}</SelectItem>
              <SelectItem value="shiftEnter" className="text-xs">{t('chatDialog.shortcutShiftEnter')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('chatDialog.confirmDelete')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.confirmDeleteDesc')}</p>
          </div>
          <Switch
            checked={settings.confirmDeleteMessage ?? true}
            onCheckedChange={(v) => update({ confirmDeleteMessage: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('chatDialog.confirmRegenerate')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.confirmRegenerateDesc')}</p>
          </div>
          <Switch
            checked={settings.confirmRegenerateMessage ?? true}
            onCheckedChange={(v) => update({ confirmRegenerateMessage: v })}
          />
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label className="text-sm">{t('chatDialog.translateLanguages')}</Label>
          <p className="text-xs text-muted-foreground">{t('chatDialog.translateLanguagesDesc')}</p>
          <Popover modal open={languagePickerOpen} onOpenChange={setLanguagePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-9 w-full justify-between px-3 py-2 text-sm font-normal"
                data-testid="chat-dialog-translate-languages-trigger"
              >
                <span className="truncate text-left">{languageSummary}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(32rem,calc(100vw-3rem))] p-0 overflow-hidden">
              <div className="border-b p-3">
                <Input
                  value={languageQuery}
                  onChange={(e) => setLanguageQuery(e.target.value)}
                  placeholder={t('chatDialog.translateLanguagesSearchPlaceholder')}
                  className="h-9 text-sm"
                />
                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span>{t('chatDialog.translateLanguagesSupported', { count: SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS.length })}</span>
                  <button
                    type="button"
                    className="transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => commitTranslateLanguages([])}
                    disabled={selectedTranslateLanguages.length === 0}
                  >
                    {t('common.clear')}
                  </button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto px-2 py-2" data-testid="chat-dialog-translate-language-list">
                {filteredLanguageOptions.length > 0 ? (
                  <div className="space-y-1">
                    {filteredLanguageOptions.map((option) => {
                      const checked = selectedTranslateLanguages.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          role="checkbox"
                          aria-checked={checked}
                          tabIndex={0}
                          onClick={() => toggleTranslateLanguage(option.value)}
                          onKeyDown={(event) => handleTranslateLanguageItemKeyDown(event, option.value)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                        >
                          <Checkbox checked={checked} className="pointer-events-none" tabIndex={-1} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{option.value}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">{t('search.noResults')}</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {selectedTranslateLanguages.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedTranslateLanguages.map((lang) => (
                <Badge key={lang} variant="secondary" className="gap-1.5 pr-1">
                  <span>{lang}</span>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-black/10"
                    onClick={() => toggleTranslateLanguage(lang)}
                    aria-label={t('chatDialog.removeTranslateLanguage', { language: lang })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('chatDialog.showTranslateConfirm')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.showTranslateConfirmDesc')}</p>
          </div>
          <Switch
            checked={settings.showTranslateConfirm ?? true}
            onCheckedChange={(v) => update({ showTranslateConfirm: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">{t('chatDialog.translateTargetLanguage')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.translateTargetLanguageDesc')}</p>
          </div>
          <Select
            value={resolvedTranslateTargetLanguage || (selectedTranslateLanguages[0] ?? '')}
            onValueChange={(v) => {
              const normalized = normalizeSupportedTranslationSelection({
                languages: selectedTranslateLanguages,
                targetLanguage: v,
                fallbackLanguages: [],
              });
              update({ translateTargetLanguage: normalized.targetLanguage });
            }}
            disabled={selectedTranslateLanguages.length === 0}
          >
            <SelectTrigger className="w-40 h-8 text-xs disabled:opacity-50">
              <SelectValue placeholder={t('common.noData')} />
            </SelectTrigger>
            <SelectContent>
              {selectedTranslateLanguages.map((lang) => (
                <SelectItem key={lang} value={lang} className="text-xs">{lang}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm">{t('chatDialog.exportOptions')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_KEYS.map((it) => (
              <label
                key={it.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
              >
                <span className="truncate">{t(it.labelKey)}</span>
                <Switch
                  checked={Boolean(exportOptions[it.key])}
                  onCheckedChange={(v) => updateExport(it.key, v)}
                />
              </label>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('chatDialog.pasteLongTextAsFile')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.pasteLongTextAsFileDesc')}</p>
          </div>
          <Switch
            checked={settings.pasteLongTextAsFile ?? true}
            onCheckedChange={(v) => update({ pasteLongTextAsFile: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">{t('chatDialog.pasteLongTextThreshold')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.pasteLongTextThresholdDesc')}</p>
          </div>
          <Input
            value={String(settings.pasteLongTextThreshold ?? 2000)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              update({ pasteLongTextThreshold: Math.max(200, Math.min(20000, Math.floor(v))) });
            }}
            className="w-28 h-8 text-xs"
            inputMode="numeric"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('chatDialog.showMessageOutline')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.showMessageOutlineDesc')}</p>
          </div>
          <Switch
            checked={settings.showMessageOutline ?? false}
            onCheckedChange={(v) => update({ showMessageOutline: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">{t('chatDialog.messageNavigation')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.messageNavigationDesc')}</p>
          </div>
          <Select
            value={settings.messageNavigation ?? 'buttons'}
            onValueChange={(v) => update({ messageNavigation: v as typeof settings.messageNavigation })}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off" className="text-xs">{t('chatDialog.navOff')}</SelectItem>
              <SelectItem value="buttons" className="text-xs">{t('chatDialog.navButtons')}</SelectItem>
              <SelectItem value="anchor" className="text-xs">{t('chatDialog.navAnchor')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">{t('chatDialog.gridTrigger')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.gridTriggerDesc')}</p>
          </div>
          <Select
            value={settings.gridPopoverTrigger ?? 'hover'}
            onValueChange={(v) => update({ gridPopoverTrigger: v as typeof settings.gridPopoverTrigger })}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hover" className="text-xs">{t('chatDialog.triggerHover')}</SelectItem>
              <SelectItem value="click" className="text-xs">{t('chatDialog.triggerClick')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('chatDialog.developerMode')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chatDialog.developerModeDesc')}</p>
          </div>
          <Switch
            checked={settings.enableDeveloperMode ?? false}
            onCheckedChange={(v) => update({ enableDeveloperMode: v })}
          />
        </div>
      </div>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
