/**
 * 说明：`AppearancePanel` 组件模块。
 *
 * 职责：
 * - 承载 `AppearancePanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `AppearancePanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useState } from 'react';
import { Check, Globe, Palette, Settings, Sparkles } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setTheme, subscribeThemeChange } from '@/lib/theme';
import { loadDisplaySettings, updateDisplaySettings } from '@/lib/display-settings';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { TooltipAction } from '@/components/ui/tooltip-action';
import {
  DARK_THEME_COLOR_PRESETS,
  normalizeDarkThemeHex,
  type DarkThemeColorSelection,
} from '@/lib/dark-theme-colors';
import {
  loadDarkThemeColorSelection,
  subscribeDarkThemeColorSelectionChange,
  updateDarkThemeColorSelection,
} from '@/lib/dark-theme-color-settings';

/** 外观设置支持的语言列表。 */
const LANGUAGES = [
  { id: 'zh-CN', labelKey: 'appearance.languages.zhCN' },
  { id: 'en-US', labelKey: 'appearance.languages.enUS' },
];

/**
 * 外观设置面板。
 *
 * 负责主题、显示偏好和语言切换这三类纯展示配置，
 * 所有变更都会直接同步到全局主题或显示设置持久层。
 */
export function AppearancePanel() {
  const { t, i18n } = useTranslation();
  /** 当前是否为暗色主题。 */
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  /** 当前深色主题色选择。 */
  const [darkThemeColor, setDarkThemeColor] = useState<DarkThemeColorSelection>(() => loadDarkThemeColorSelection());
  /** Hex 输入草稿，只有合法提交后才写入共享配置。 */
  const [themeColorInput, setThemeColorInput] = useState(() => loadDarkThemeColorSelection().sourceHex);
  /** 是否仅在显示层把置顶话题浮到前面。 */
  const [pinTopicsToTop, setPinTopicsToTop] = useState(() => loadDisplaySettings().pinTopicsToTop);
  /** 扩展设置入口的默认打开承载方式。 */
  const [extensionSettingsOpenMode, setExtensionSettingsOpenMode] = useState(() => (
    loadDisplaySettings().extensionSettingsOpenMode
  ));

  useEffect(() => {
    const off = subscribeThemeChange(() => setDark(document.documentElement.classList.contains('dark')));
    return () => off();
  }, []);

  useEffect(() => {
    const off = subscribeDarkThemeColorSelectionChange(() => {
      const next = loadDarkThemeColorSelection();
      setDarkThemeColor(next);
      setThemeColorInput(next.sourceHex);
    });
    return () => off();
  }, []);

  /**
   * 提交自定义 Hex 主题色输入。
   *
   * 说明：
   * - 只接受当前协议明确支持的 `#RRGGBB`；
   * - 非法输入直接回到已保存值，不写入共享配置。
   */
  const commitThemeColorInput = () => {
    const sourceHex = normalizeDarkThemeHex(themeColorInput);
    if (!sourceHex) {
      setThemeColorInput(darkThemeColor.sourceHex);
      return;
    }
    const next = updateDarkThemeColorSelection({ kind: 'custom', presetId: null, sourceHex });
    setDarkThemeColor(next);
    setThemeColorInput(next.sourceHex);
  };

  /**
   * 切换扩展设置入口承载方式。
   *
   * @param value - Select 回传的候选值。
   */
  const handleExtensionSettingsOpenModeChange = (value: string) => {
    const next = value === 'workspace' ? 'workspace' : 'dialog';
    setExtensionSettingsOpenMode(next);
    updateDisplaySettings({ extensionSettingsOpenMode: next });
  };

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">{t('settings.appearance')}</h3>
        <p className="text-sm text-muted-foreground">{t('appearance.description')}</p>
      </div>

      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-fuchsia-500" />
            <div>
              <Label className="text-sm">{t('appearance.darkMode')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('appearance.darkModeDesc')}</p>
            </div>
          </div>
          <Switch checked={dark} onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')} />
        </div>

        {dark && (
          <div className="grid grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)] items-start gap-3 border-t border-border/60 pt-4 max-[620px]:grid-cols-1">
            <div className="flex w-full max-w-56 shrink-0 items-start gap-2">
              <Palette className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <Label className="whitespace-nowrap text-sm">{t('appearance.themeColor')}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('appearance.themeColorDesc')}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 max-[620px]:justify-start">
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-[620px]:justify-start" role="group" aria-label={t('appearance.themeColorPresetList')}>
                {DARK_THEME_COLOR_PRESETS.map((preset) => {
                  const active = darkThemeColor.kind === 'preset' && darkThemeColor.presetId === preset.id;
                  return (
                    <TooltipAction key={preset.id} tooltip={t(preset.labelKey)} side="top">
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={t(preset.labelKey)}
                        className={cn(
                          'relative h-6 w-6 shrink-0 rounded-full border border-border/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          active ? 'shadow-sm ring-2 ring-ring ring-offset-2 ring-offset-background' : 'hover:scale-105 hover:border-foreground/30',
                        )}
                        style={{
                          background: `linear-gradient(135deg, ${preset.swatchStartHex}, ${preset.swatchEndHex})`,
                        }}
                        onClick={() => {
                          const next = updateDarkThemeColorSelection({
                            kind: 'preset',
                            presetId: preset.id,
                            sourceHex: preset.sourceHex,
                          });
                          setDarkThemeColor(next);
                          setThemeColorInput(next.sourceHex);
                        }}
                      >
                        {active && <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />}
                      </button>
                    </TooltipAction>
                  );
                })}
              </div>
              <Input
                value={themeColorInput}
                aria-label={t('appearance.themeColorHexLabel')}
                className="h-8 w-24 shrink-0 font-mono text-xs uppercase"
                spellCheck={false}
                maxLength={7}
                onChange={(event) => setThemeColorInput(event.target.value.toUpperCase())}
                onBlur={commitThemeColorInput}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitThemeColorInput();
                    event.currentTarget.blur();
                  }
                  if (event.key === 'Escape') {
                    setThemeColorInput(darkThemeColor.sourceHex);
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <div>
              <Label className="text-sm">{t('appearance.pinTopicsToTop')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('appearance.pinTopicsToTopDesc')}</p>
            </div>
          </div>
          <Switch
            checked={pinTopicsToTop}
            onCheckedChange={(value) => {
              setPinTopicsToTop(value);
              updateDisplaySettings({ pinTopicsToTop: value });
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-4 max-[520px]:items-start max-[520px]:flex-col">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-sky-500" />
            <div>
              <Label className="text-sm">{t('appearance.extensionSettingsOpenMode')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('appearance.extensionSettingsOpenModeDesc')}</p>
            </div>
          </div>
          <Select value={extensionSettingsOpenMode} onValueChange={handleExtensionSettingsOpenModeChange}>
            <SelectTrigger
              aria-label={t('appearance.extensionSettingsOpenMode')}
              className="w-36 h-8 text-xs max-[520px]:w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dialog" className="text-xs">
                {t('appearance.extensionSettingsOpenModeDialog')}
              </SelectItem>
              <SelectItem value="workspace" className="text-xs">
                {t('appearance.extensionSettingsOpenModeWorkspace')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4 max-[520px]:items-start max-[520px]:flex-col">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-500" />
            <div>
              <Label className="text-sm">{t('appearance.language')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('appearance.languageDesc')}</p>
            </div>
          </div>
          <Select value={i18n.language} onValueChange={(v) => setLanguage(v)}>
            <SelectTrigger
              aria-label={t('appearance.language')}
              className="w-36 h-8 text-xs max-[520px]:w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.id} value={language.id} className="text-xs">
                  {t(language.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
