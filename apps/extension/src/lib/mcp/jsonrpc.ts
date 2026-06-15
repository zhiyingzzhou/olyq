/**
 * 说明：`jsonrpc` 基础能力模块。
 *
 * 职责：
 * - 承载 `jsonrpc` 相关的当前文件实现与模块边界；
 * - 对外暴露 `JsonRpcId`、`JsonRpcRequest`、`JsonRpcNotification` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createId } from '@/lib/utils/id';
import { isRecord } from '@/lib/utils/type-guards';

/** JSON-RPC 2.0 的 id 字段类型 */
export type JsonRpcId = string | number;

/** JSON-RPC 2.0 请求消息 */
export type JsonRpcRequest = {
  /** 协议版本（固定为 "2.0"） */
  jsonrpc: '2.0';
  /** 请求 ID（用于匹配响应） */
  id: JsonRpcId;
  /** 方法名 */
  method: string;
  /** 可选：参数 */
  params?: unknown;
};

/** JSON-RPC 2.0 通知消息（无 id、无响应） */
export type JsonRpcNotification = {
  /** 协议版本（固定为 "2.0"） */
  jsonrpc: '2.0';
  /** 方法名 */
  method: string;
  /** 可选：参数 */
  params?: unknown;
};

/** JSON-RPC 2.0 成功响应 */
export type JsonRpcSuccess = {
  /** 协议版本（固定为 "2.0"） */
  jsonrpc: '2.0';
  /** 对应的请求 ID */
  id: JsonRpcId;
  /** 返回结果 */
  result: unknown;
};

/** JSON-RPC 2.0 的 error 字段 */
type JsonRpcErrorObject = {
  /** 错误码（协议约定或业务自定义） */
  code: number;
  /** 错误信息 */
  message: string;
  /** 可选：附加数据（用于调试/上下文） */
  data?: unknown;
};

/** JSON-RPC 2.0 错误响应 */
export type JsonRpcError = {
  /** 协议版本（固定为 "2.0"） */
  jsonrpc: '2.0';
  /** 对应的请求 ID（解析失败等场景可能为 null） */
  id: JsonRpcId | null;
  /** 错误对象 */
  error: JsonRpcErrorObject;
};

/** JSON-RPC 2.0 响应消息（成功/错误二选一） */
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/** JSON-RPC 2.0 单条消息（请求/通知/响应） */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/** 判断任意值是否为 JSON-RPC 2.0 响应消息（成功或错误）。 */
export function isJsonRpcResponse(v: unknown): v is JsonRpcResponse {
  if (!isRecord(v)) return false;
  if (v.jsonrpc !== '2.0') return false;
  return 'result' in v || 'error' in v;
}

/** 判断任意值是否为 JSON-RPC 2.0 错误响应。 */
export function isJsonRpcError(v: unknown): v is JsonRpcError {
  if (!isRecord(v)) return false;
  if (v.jsonrpc !== '2.0') return false;
  if (!('error' in v)) return false;
  const err = v.error;
  if (!isRecord(err)) return false;
  return typeof err.code === 'number' && typeof err.message === 'string';
}

/** 生成一条新的 JSON-RPC 请求 ID。 */
export function createJsonRpcId() {
  return createId();
}
