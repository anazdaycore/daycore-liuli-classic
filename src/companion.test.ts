import { describe, expect, it } from 'vitest';
import { foldToolFrames, parseToolEvents, toolLinkTarget } from './companion';

describe('parseToolEvents', () => {
  it('parses a JSON array of frames', () => {
    const raw = JSON.stringify([
      { type: 'tool_start', callId: 'c1', tool: 'plan_add' },
      { type: 'tool_result', callId: 'c1', tool: 'plan_add', ok: true, opId: 'op1' },
      { type: 'decision_card', id: 'dc1', title: 'x', options: [{ id: 'a', label: 'A' }] },
    ]);
    const frames = parseToolEvents(raw);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toEqual({ type: 'tool_start', callId: 'c1', tool: 'plan_add' });
  });

  it('returns nothing for missing or empty input', () => {
    expect(parseToolEvents(undefined)).toEqual([]);
    expect(parseToolEvents('')).toEqual([]);
  });

  it('returns nothing for malformed JSON rather than throwing', () => {
    expect(parseToolEvents('{nope')).toEqual([]);
    expect(parseToolEvents('42')).toEqual([]);
    expect(parseToolEvents('"a string"')).toEqual([]);
    expect(parseToolEvents('{"a":1}')).toEqual([]);
  });

  it('drops entries that carry no string type', () => {
    const raw = JSON.stringify([
      { type: 'delta', text: 'x' },
      null,
      7,
      'nope',
      { type: 'tool_start', callId: 'c', tool: 'plan_add' },
    ]);
    const frames = parseToolEvents(raw);
    expect(frames).toHaveLength(2);
  });
});

describe('foldToolFrames', () => {
  it('collapses a tool_start/tool_result pair into one done card', () => {
    const actions = foldToolFrames([
      { type: 'tool_start', callId: 'c1', tool: 'plan_add' },
      { type: 'tool_result', callId: 'c1', tool: 'plan_add', ok: true, opId: 'op1' },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      kind: 'tool',
      callId: 'c1',
      tool: 'plan_add',
      state: 'done',
      result: { type: 'tool_result', callId: 'c1', tool: 'plan_add', ok: true, opId: 'op1' },
    });
  });

  it('keeps a lone tool_start as a running card', () => {
    const actions = foldToolFrames([{ type: 'tool_start', callId: 'c2', tool: 'web_search' }]);
    expect(actions).toEqual([{ kind: 'tool', callId: 'c2', tool: 'web_search', state: 'running' }]);
  });

  it('skips propose_decision frames and keeps the decision card', () => {
    const actions = foldToolFrames([
      { type: 'tool_start', callId: 'c3', tool: 'propose_decision' },
      { type: 'decision_card', id: 'dc1', title: 'x', options: [] },
      { type: 'tool_result', callId: 'c3', tool: 'propose_decision', ok: true },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ kind: 'decision', card: { type: 'decision_card', id: 'dc1', title: 'x', options: [] } });
  });

  it('preserves interleaved order', () => {
    const actions = foldToolFrames([
      { type: 'tool_start', callId: 'a', tool: 'plan_add' },
      { type: 'tool_result', callId: 'a', tool: 'plan_add', ok: true },
      { type: 'tool_start', callId: 'b', tool: 'memory_add' },
    ]);
    expect(actions.map((a) => (a.kind === 'tool' ? a.callId : 'card'))).toEqual(['a', 'b']);
  });
});

describe('toolLinkTarget', () => {
  it('routes rule tools to the rules list', () => {
    expect(toolLinkTarget('rule_upsert')).toBe('rules');
    expect(toolLinkTarget('rule_remove')).toBe('rules');
  });

  it('routes memory tools to memory', () => {
    expect(toolLinkTarget('memory_add')).toBe('memory');
    expect(toolLinkTarget('memory_remove')).toBe('memory');
  });

  it('routes every plan tool to the plan', () => {
    expect(toolLinkTarget('plan_add')).toBe('plan');
    expect(toolLinkTarget('plan_update')).toBe('plan');
    expect(toolLinkTarget('plan_remove')).toBe('plan');
  });

  it('returns null for tools with no follow-up page', () => {
    expect(toolLinkTarget('get_weather')).toBeNull();
    expect(toolLinkTarget('web_search')).toBeNull();
  });
});
