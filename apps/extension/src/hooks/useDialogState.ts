/**
 * 说明：`useDialogState` Hook 模块。
 *
 * 职责：
 * - 承载 `useDialogState` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DialogState`、`DialogName`、`UseDialogStateResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useReducer, useCallback } from 'react';

/**
 * 修复 M-12：将 Index.tsx 中 ~15 个 boolean dialog useState 合并为单一 useReducer，
 * 减少组件顶层 hook 数量，并提供类型安全的 open/close 接口。
 */

/**
 * 页面级弹窗状态集合。
 *
 * 说明：
 * - 每个字段都对应一个独立弹窗或面板的可见性；
 * - 该对象只承载“是否打开”，不混入弹窗内部业务数据。
 */
export interface DialogState {
  /** 设置弹窗是否打开。 */
  showSettings: boolean;
  /** 提示词管理弹窗是否打开。 */
  showPrompts: boolean;
  /** 扩展设置弹窗是否打开。 */
  showExtSettings: boolean;
  /** 模型选择器弹窗是否打开。 */
  showModelPicker: boolean;
  /** 翻译弹窗是否打开。 */
  showTranslation: boolean;
  /** 全局搜索弹窗是否打开。 */
  showGlobalSearch: boolean;
  /** 完整助手商店是否打开。 */
  showAssistantStore: boolean;
  /** 助手侧栏快速创建使用的轻量选择弹窗是否打开。 */
  showAssistantRolePicker: boolean;
  /** 助手编辑器是否打开。 */
  showAssistantEditor: boolean;
  /** 多模型对比视图是否打开。 */
  showCompare: boolean;
  /** 常用短语面板是否打开。 */
  showPhrases: boolean;
  /** 启动台面板是否打开。 */
  showLaunchpad: boolean;
  /** 文件面板是否打开。 */
  showFiles: boolean;
}

/** 可操作的弹窗名称。 */
export type DialogName = keyof DialogState;

/** 打开指定弹窗的 reducer 动作。 */
interface OpenDialogAction {
  /** 动作类型：打开。 */
  type: 'open';
  /** 目标弹窗名称。 */
  name: DialogName;
}

/** 关闭指定弹窗的 reducer 动作。 */
interface CloseDialogAction {
  /** 动作类型：关闭。 */
  type: 'close';
  /** 目标弹窗名称。 */
  name: DialogName;
}

/** 切换指定弹窗开关状态的 reducer 动作。 */
interface ToggleDialogAction {
  /** 动作类型：切换。 */
  type: 'toggle';
  /** 目标弹窗名称。 */
  name: DialogName;
}

/** 直接写入弹窗布尔状态的 reducer 动作。 */
interface SetDialogAction {
  /** 动作类型：直接赋值。 */
  type: 'set';
  /** 目标弹窗名称。 */
  name: DialogName;
  /** 要写入的开关值。 */
  value: boolean;
}

/** 一次性关闭全部弹窗的 reducer 动作。 */
interface CloseAllDialogsAction {
  /** 动作类型：关闭全部。 */
  type: 'closeAll';
}

/** 弹窗状态 reducer 的动作集合。 */
type Action =
  | OpenDialogAction
  | CloseDialogAction
  | ToggleDialogAction
  | SetDialogAction
  | CloseAllDialogsAction;

/** 所有弹窗的初始关闭状态。 */
const INITIAL: DialogState = {
  showSettings: false,
  showPrompts: false,
  showExtSettings: false,
  showModelPicker: false,
  showTranslation: false,
  showGlobalSearch: false,
  showAssistantStore: false,
  showAssistantRolePicker: false,
  showAssistantEditor: false,
  showCompare: false,
  showPhrases: false,
  showLaunchpad: false,
  showFiles: false,
};

/**
 * 统一处理弹窗开关动作。
 *
 * 说明：
 * - 在状态未发生变化时直接返回旧对象，减少无意义重渲染；
 * - `closeAll` 直接回退到常量初始值，用于全局收口场景。
 */
function reducer(state: DialogState, action: Action): DialogState {
  switch (action.type) {
    case 'open':
      return state[action.name] ? state : { ...state, [action.name]: true };
    case 'close':
      return !state[action.name] ? state : { ...state, [action.name]: false };
    case 'toggle':
      return { ...state, [action.name]: !state[action.name] };
    case 'set':
      return state[action.name] === action.value ? state : { ...state, [action.name]: action.value };
    case 'closeAll':
      return INITIAL;
  }
}

/** `useDialogState` 的返回结构。 */
export interface UseDialogStateResult {
  /** 当前所有弹窗的开关快照。 */
  dialogs: DialogState;
  /** 打开指定弹窗。 */
  open: (name: DialogName) => void;
  /** 关闭指定弹窗。 */
  close: (name: DialogName) => void;
  /** 切换指定弹窗的开关状态。 */
  toggle: (name: DialogName) => void;
  /** 直接设置指定弹窗的开关值。 */
  setDialog: (name: DialogName, value: boolean) => void;
}

/**
 * 统一管理多个 Dialog 的开关状态（open/close/toggle/set）。
 *
 * @returns dialogs 状态 + 操作方法
 */
export function useDialogState(): UseDialogStateResult {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  /** 打开单个弹窗。 */
  const open = useCallback((name: DialogName) => dispatch({ type: 'open', name }), []);
  /** 关闭单个弹窗。 */
  const close = useCallback((name: DialogName) => dispatch({ type: 'close', name }), []);
  /** 切换单个弹窗的显示状态。 */
  const toggle = useCallback((name: DialogName) => dispatch({ type: 'toggle', name }), []);
  /** 直接写入指定弹窗的显示状态。 */
  const setDialog = useCallback((name: DialogName, value: boolean) => dispatch({ type: 'set', name, value }), []);

  return { dialogs: state, open, close, toggle, setDialog };
}
