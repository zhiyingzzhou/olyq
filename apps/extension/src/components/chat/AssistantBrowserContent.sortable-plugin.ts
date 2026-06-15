/**
 * 说明：`AssistantBrowserContent.sortable-plugin` 组件模块。
 *
 * 职责：
 * - 承载助手侧栏 sortable 需要统一复用的 sensor 集合；
 * - 让 rows 层继续只关心 `useSortable` 接线，不在调用点散落交互策略配置。
 *
 * 边界：
 * - 组内即时让位完全交给 dnd-kit sortable 默认插件；
 * - 本文件不再额外维护自定义 optimistic sorting plugin 或第二套 drag fallback。
 */
import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from '@dnd-kit/dom';
const ASSISTANT_BROWSER_MOUSE_DRAG_ACTIVATION_DISTANCE = 4;

/**
 * 助手侧栏 pointer sensor 激活约束。
 *
 * 说明：
 * - 鼠标在 handle 上按下后只要求一个接近直接拖拽的小位移，再真正进入 dnd 会话；
 * - prepare 态仍能在这段空档先把大列表切成全量真实 DOM，但不再依赖夸张位移距离去“硬等几何补偿”；
 * - touch / 其它指针仍沿用接近默认值的延迟语义，避免把移动端体验一并改坏。
 */
function resolveAssistantBrowserPointerActivationConstraints(event: PointerEvent) {
  if (event.pointerType === 'mouse') {
    return [
      new PointerActivationConstraints.Distance({
        value: ASSISTANT_BROWSER_MOUSE_DRAG_ACTIVATION_DISTANCE,
      }),
    ];
  }

  if (event.pointerType === 'touch') {
    return [
      new PointerActivationConstraints.Delay({
        value: 250,
        tolerance: 5,
      }),
    ];
  }

  return [
    new PointerActivationConstraints.Delay({
      value: 200,
      tolerance: 10,
    }),
    new PointerActivationConstraints.Distance({
      value: 5,
    }),
  ];
}

/** 助手侧栏 sortable 当前统一使用的 sensor 集合。 */
export const ASSISTANT_BROWSER_SORTABLE_SENSORS = [
  PointerSensor.configure({
    activationConstraints: resolveAssistantBrowserPointerActivationConstraints,
  }),
  KeyboardSensor,
];
