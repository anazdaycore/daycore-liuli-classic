import type { CompanionFrame, DecisionCardFrame, ToolResultFrame } from '@daycore/core';

// 一条聊天消息的 toolEvents 是 JSON 字符串：后端 async 模式把 SSE v2 帧
// （tool_start / tool_result / decision_card）持久化成这个字符串，前端解析后
// 按与流式帧一模一样的规则渲染（handlers_ai_companion_async.go 的 recordingSink）。

/**
 * 把 ChatMessage.toolEvents（JSON 字符串）解析成帧数组。
 *
 * ⚠️ 坏输入只返回空数组，不抛错：一条坏帧不该崩掉整个对话。老数据里这个
 * 字段可能缺失或为空，都读作「没有动作卡」。
 */
export function parseToolEvents(raw: string | undefined): CompanionFrame[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (f): f is CompanionFrame =>
      !!f && typeof f === 'object' && typeof (f as { type?: unknown }).type === 'string',
  );
}

/** 折叠后的一条动作卡，或一张决策卡。 */
export type CompanionAction =
  | { kind: 'tool'; callId: string; tool: string; state: 'running' | 'done'; result?: ToolResultFrame }
  | { kind: 'decision'; card: DecisionCardFrame };

/**
 * 把帧序列折叠成要渲染的卡。tool_start 与同 callId 的 tool_result 合成一张卡
 * （SSE 流式里是「正在…」原地更新，async 的静态列表里则是两条相邻帧）；
 * propose_decision 的开始/结束帧被跳过 —— 它的可见产物是决策卡本身。
 */
export function foldToolFrames(frames: CompanionFrame[]): CompanionAction[] {
  const out: CompanionAction[] = [];
  const indexByCall = new Map<string, number>();
  for (const f of frames) {
    if (f.type === 'decision_card') {
      out.push({ kind: 'decision', card: f });
      continue;
    }
    if (f.type === 'tool_start') {
      if (f.tool === 'propose_decision') continue;
      indexByCall.set(f.callId, out.length);
      out.push({ kind: 'tool', callId: f.callId, tool: f.tool, state: 'running' });
      continue;
    }
    if (f.type === 'tool_result') {
      if (f.tool === 'propose_decision') continue;
      const at = indexByCall.get(f.callId);
      if (at !== undefined) {
        out[at] = { kind: 'tool', callId: f.callId, tool: f.tool, state: 'done', result: f };
      } else {
        indexByCall.set(f.callId, out.length);
        out.push({ kind: 'tool', callId: f.callId, tool: f.tool, state: 'done', result: f });
      }
    }
  }
  return out;
}

/**
 * 一个工具的「查看」链接该去哪。
 */
export type ToolLinkTarget = 'rules' | 'memory' | 'plan' | null;

export function toolLinkTarget(tool: string): ToolLinkTarget {
  if (tool === 'rule_upsert' || tool === 'rule_remove') return 'rules';
  if (tool === 'memory_add' || tool === 'memory_remove') return 'memory';
  if (tool.startsWith('plan_')) return 'plan';
  return null;
}
