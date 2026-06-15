/**
 * 说明：`WelcomeEmptyState` 组件模块。
 *
 * 职责：
 * - 承载 `WelcomeEmptyState` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WelcomeEmptyState` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Bot, MessageSquareText, Paperclip, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** 欢迎空态属性。 */
interface WelcomeEmptyStateProps {
  /** 当前默认模型名称，用于文案中回显。 */
  readonly modelName?: string;
}

/** 欢迎页展示的能力卡片配置。 */
const FEATURE_ITEMS = [
  { key: 'ask', icon: MessageSquareText },
  { key: 'attach', icon: Paperclip },
  { key: 'model', icon: Sparkles },
] as const;

/**
 * 首页无消息时的欢迎空态。
 *
 * 负责展示产品能力与输入提示，不涉及任何话题状态写入。
 */
export function WelcomeEmptyState({ modelName }: WelcomeEmptyStateProps) {
  const { t } = useTranslation();
  /** 文案中回显的模型名称，未提供时使用通用 `AI` 占位。 */
  const resolvedModelName = modelName || 'AI';

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div
        data-testid="welcome-empty-state-panel"
        className="rounded-[28px] border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-6 shadow-none"
      >
        <div className="flex flex-col gap-6">
          <div className="flex gap-4">
            <div
              data-testid="welcome-empty-state-hero-icon"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-none"
            >
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {t('welcome.badge')}
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                {t('welcome.title')}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('welcome.description', { modelName: resolvedModelName })}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {FEATURE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.key}
                  data-testid="welcome-empty-state-feature-card"
                  className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-none"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/80 text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="mt-4 text-sm font-medium text-foreground">
                    {t(`welcome.${item.key}Title`)}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t(`welcome.${item.key}Desc`)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-4 py-3">
            <div className="text-sm font-medium text-foreground">{t('welcome.hintTitle')}</div>
            <p className="mt-1 text-sm text-muted-foreground">{t('chat.inputHints')}</p>
          </div>
        </div>
      </div>

    </div>
  );
}
