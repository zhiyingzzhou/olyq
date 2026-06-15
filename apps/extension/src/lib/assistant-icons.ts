/**
 * 说明：`assistant-icons` 基础能力模块。
 *
 * 职责：
 * - 承载 `assistant-icons` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DEFAULT_ASSISTANT_ICON_ID`、`AssistantIconOption`、`ASSISTANT_ICON_OPTIONS` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BadgeCheck,
  Blocks,
  BookOpen,
  Bot,
  Brain,
  Bug,
  Calendar,
  ChartColumn,
  ChartLine,
  CircleHelp,
  Code2,
  Compass,
  FilePen,
  Files,
  FlaskConical,
  Folders,
  Globe,
  GraduationCap,
  Handshake,
  Image,
  Languages,
  Lightbulb,
  ListChecks,
  Logs,
  Mail,
  Map as MapIcon,
  Megaphone,
  MessagesSquare,
  Microscope,
  Newspaper,
  Palette,
  Pin,
  Plug,
  Puzzle,
  ReceiptText,
  Route,
  Ruler,
  Scale,
  Scissors,
  Search,
  Send,
  Settings2,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Target,
  TriangleAlert,
  Wrench,
  Presentation,
  Zap,
} from 'lucide-react';

import type { AssistantIconId } from '@/types/assistant';
import { isAssistantIconId } from '@/types/assistant';

/**
 * 导出常量：`DEFAULT_ASSISTANT_ICON_ID`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const DEFAULT_ASSISTANT_ICON_ID: AssistantIconId = 'bot';

/** 导出类型：`AssistantIconOption`。 */
export type AssistantIconOption = {
  id: AssistantIconId;
  labelKey: string;
  icon: LucideIcon;
};

/**
 * 导出常量：`ASSISTANT_ICON_OPTIONS`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const ASSISTANT_ICON_OPTIONS: AssistantIconOption[] = [
  { id: 'bot', labelKey: 'assistant.iconCatalog.bot', icon: Bot },
  { id: 'compass', labelKey: 'assistant.iconCatalog.compass', icon: Compass },
  { id: 'book-open', labelKey: 'assistant.iconCatalog.bookOpen', icon: BookOpen },
  { id: 'newspaper', labelKey: 'assistant.iconCatalog.newspaper', icon: Newspaper },
  { id: 'circle-help', labelKey: 'assistant.iconCatalog.circleHelp', icon: CircleHelp },
  { id: 'languages', labelKey: 'assistant.iconCatalog.languages', icon: Languages },
  { id: 'puzzle', labelKey: 'assistant.iconCatalog.puzzle', icon: Puzzle },
  { id: 'file-pen', labelKey: 'assistant.iconCatalog.filePen', icon: FilePen },
  { id: 'graduation-cap', labelKey: 'assistant.iconCatalog.graduationCap', icon: GraduationCap },
  { id: 'badge-check', labelKey: 'assistant.iconCatalog.badgeCheck', icon: BadgeCheck },
  { id: 'search', labelKey: 'assistant.iconCatalog.search', icon: Search },
  { id: 'scale', labelKey: 'assistant.iconCatalog.scale', icon: Scale },
  { id: 'shopping-cart', labelKey: 'assistant.iconCatalog.shoppingCart', icon: ShoppingCart },
  { id: 'blocks', labelKey: 'assistant.iconCatalog.blocks', icon: Blocks },
  { id: 'chart-column', labelKey: 'assistant.iconCatalog.chartColumn', icon: ChartColumn },
  { id: 'chart-line', labelKey: 'assistant.iconCatalog.chartLine', icon: ChartLine },
  { id: 'code-2', labelKey: 'assistant.iconCatalog.code2', icon: Code2 },
  { id: 'image', labelKey: 'assistant.iconCatalog.image', icon: Image },
  { id: 'mail', labelKey: 'assistant.iconCatalog.mail', icon: Mail },
  { id: 'megaphone', labelKey: 'assistant.iconCatalog.megaphone', icon: Megaphone },
  { id: 'send', labelKey: 'assistant.iconCatalog.send', icon: Send },
  { id: 'wrench', labelKey: 'assistant.iconCatalog.wrench', icon: Wrench },
  { id: 'folders', labelKey: 'assistant.iconCatalog.folders', icon: Folders },
  { id: 'archive', labelKey: 'assistant.iconCatalog.archive', icon: Archive },
  { id: 'palette', labelKey: 'assistant.iconCatalog.palette', icon: Palette },
  { id: 'scissors', labelKey: 'assistant.iconCatalog.scissors', icon: Scissors },
  { id: 'sliders-horizontal', labelKey: 'assistant.iconCatalog.slidersHorizontal', icon: SlidersHorizontal },
  { id: 'brain', labelKey: 'assistant.iconCatalog.brain', icon: Brain },
  { id: 'calendar', labelKey: 'assistant.iconCatalog.calendar', icon: Calendar },
  { id: 'bug', labelKey: 'assistant.iconCatalog.bug', icon: Bug },
  { id: 'flask-conical', labelKey: 'assistant.iconCatalog.flaskConical', icon: FlaskConical },
  { id: 'plug', labelKey: 'assistant.iconCatalog.plug', icon: Plug },
  { id: 'globe', labelKey: 'assistant.iconCatalog.globe', icon: Globe },
  { id: 'map', labelKey: 'assistant.iconCatalog.map', icon: MapIcon },
  { id: 'triangle-alert', labelKey: 'assistant.iconCatalog.triangleAlert', icon: TriangleAlert },
  { id: 'logs', labelKey: 'assistant.iconCatalog.logs', icon: Logs },
  { id: 'receipt-text', labelKey: 'assistant.iconCatalog.receiptText', icon: ReceiptText },
  { id: 'route', labelKey: 'assistant.iconCatalog.route', icon: Route },
  { id: 'list-checks', labelKey: 'assistant.iconCatalog.listChecks', icon: ListChecks },
  { id: 'lightbulb', labelKey: 'assistant.iconCatalog.lightbulb', icon: Lightbulb },
  { id: 'sparkles', labelKey: 'assistant.iconCatalog.sparkles', icon: Sparkles },
  { id: 'tags', labelKey: 'assistant.iconCatalog.tags', icon: Tags },
  { id: 'presentation', labelKey: 'assistant.iconCatalog.presentation', icon: Presentation },
  { id: 'files', labelKey: 'assistant.iconCatalog.files', icon: Files },
  { id: 'messages-square', labelKey: 'assistant.iconCatalog.messagesSquare', icon: MessagesSquare },
  { id: 'handshake', labelKey: 'assistant.iconCatalog.handshake', icon: Handshake },
  { id: 'pin', labelKey: 'assistant.iconCatalog.pin', icon: Pin },
  { id: 'settings-2', labelKey: 'assistant.iconCatalog.settings2', icon: Settings2 },
  { id: 'target', labelKey: 'assistant.iconCatalog.target', icon: Target },
  { id: 'microscope', labelKey: 'assistant.iconCatalog.microscope', icon: Microscope },
  { id: 'ruler', labelKey: 'assistant.iconCatalog.ruler', icon: Ruler },
  { id: 'zap', labelKey: 'assistant.iconCatalog.zap', icon: Zap },
];

const ASSISTANT_ICON_OPTION_MAP = new Map(
  ASSISTANT_ICON_OPTIONS.map((option) => [option.id, option]),
);

/**
 * 导出函数：`normalizeAssistantIconId`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function normalizeAssistantIconId(value: unknown): AssistantIconId | undefined {
  const next = typeof value === 'string' ? value.trim() : '';
  if (next && isAssistantIconId(next)) return next;
  return undefined;
}

/**
 * 导出函数：`getAssistantIconOption`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getAssistantIconOption(iconId: unknown): AssistantIconOption {
  const normalized = normalizeAssistantIconId(iconId);
  return ASSISTANT_ICON_OPTION_MAP.get(normalized ?? DEFAULT_ASSISTANT_ICON_ID)
    ?? ASSISTANT_ICON_OPTION_MAP.get(DEFAULT_ASSISTANT_ICON_ID)!;
}
