import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@daycore/core';
import { ApiError, type Boot } from '@daycore/core';
import { foldRange, groupDay, weekOf, type DayCell, type Grouped } from './days';

// 初版's state.
//
// Same discipline as the other three — NO optimistic updates — because
// PATCH /api/plan can be refused with 409 by the plan gate. What is different
// here is how much a stale write costs: this is the only one of the four that
// derives the SAME fact into three places at once (the week strip's dots, the
// progress line, the list itself), so a local guess that the server then
// rejects leaves three widgets disagreeing with each other on one screen.
//
// ⚠️ And the day is a variable. `refresh` reloads two things, not one — the day
// you are looking at, and the week it sits in — because moving the cursor
// changes both and reloading only the first leaves the strip pointing at a day
// that is no longer selected.

export interface UndoOffer {
  opId: string;
  label: string;
}

/** A refused plan write, read off the 409 envelope so the UI can offer the
 *  three ways out instead of just a sentence. The editor shows one block at a
 *  time, so it does not need to know which block the refusal names. */
export interface PlanRefusal {
  code: 'locked' | 'petrified' | 'refish_capped';
}

const UNDO_MS = 4000;

function refusalOf(e: unknown): PlanRefusal | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const body = e.body as { code?: string } | null;
  const code = body?.code;
  if (code === 'locked' || code === 'petrified' || code === 'refish_capped') {
    return { code };
  }
  return null;
}

export function useStore(boot: Boot) {
  const t = boot.catalog.t;
  const TZ = api.sessionTimezone(boot.session);
  const [date, setDate] = useState(() => api.todayIsoInTZ(TZ));
  const [plan, setPlan] = useState<api.DayPlan | null>(null);
  const [week, setWeek] = useState<DayCell[]>([]);
  const [proposals, setProposals] = useState<api.Proposal[]>([]);
  const [undo, setUndo] = useState<UndoOffer | null>(null);
  const [refusal, setRefusal] = useState<PlanRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(() => api.nowMinutesInTZ(TZ));
  const today = api.todayIsoInTZ(TZ);

  useEffect(() => {
    const h = setInterval(() => setTick(api.nowMinutesInTZ(TZ)), 30_000);
    return () => clearInterval(h);
  }, []);

  const refresh = useCallback(async () => {
    const days = weekOf(date);
    const from = days[0]!;
    const to = days[6]!;
    try {
      const [pl, ps, range] = await Promise.all([
        api.planForDate(date),
        api.proposals(),
        api.planRange(from, to),
      ]);
      setPlan(pl);
      setProposals(ps.proposals ?? []);
      setWeek(foldRange(range ?? [], from, to));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const timer = useRef<number | null>(null);
  const offer = useCallback((opId: string, label: string) => {
    setUndo({ opId, label });
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /**
   * Run a write, then reload, then offer to take it back.
   *
   * ⚠️ The op id comes from GET /api/ops AFTER the write — the write endpoints
   * answer with the new state, not with the operation. An undo bar that cannot
   * name what it would undo is decoration.
   *
   * ⚠️ A 409 from the plan gate is surfaced as `refusal` rather than folded into
   * the generic error line, so the caller can render the three ways out.
   */
  const act = useCallback(
    async (run: () => Promise<unknown>, label: string) => {
      setBusy(true);
      setError('');
      setRefusal(null);
      try {
        await run();
        let opId: string | null = null;
        try {
          const { ops } = await api.ops(1);
          const top = ops?.[0];
          opId = top ? top.id : null;
        } catch {
          opId = null;
        }
        await refresh();
        if (opId) offer(opId, label);
      } catch (e) {
        const refusal = refusalOf(e);
        if (refusal) {
          setRefusal(refusal);
          setError(e instanceof Error ? e.message : String(e));
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
        // ⚠️ Reload even on failure. A 409 from the plan gate means the server's
        // day differs from the one on screen, and that is exactly when showing
        // the stale one is worst.
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [offer, refresh],
  );

  const complete = useCallback(
    (b: api.TimeBlock) =>
      act(
        () => api.patchPlan(date, { action: 'update', match: { id: b.id }, changes: { completed: true } }),
        t('undo.completed', { title: b.title }),
      ),
    [act, date, t],
  );

  const toggleComplete = useCallback(
    (b: api.TimeBlock) =>
      act(
        () => api.patchPlan(date, { action: 'update', match: { id: b.id }, changes: { completed: !b.completed } }),
        t(b.completed ? 'undo.uncompleted' : 'undo.completed', { title: b.title }),
      ),
    [act, date, t],
  );

  const update = useCallback(
    (b: api.TimeBlock, changes: Record<string, unknown>) =>
      act(
        () => api.patchPlan(date, { action: 'update', match: { id: b.id }, changes }),
        t('undo.updated', { title: b.title }),
      ),
    [act, date, t],
  );

  const remove = useCallback(
    (b: api.TimeBlock) =>
      act(
        () => api.patchPlan(date, { action: 'remove', match: { id: b.id } }),
        t('undo.removed', { title: b.title }),
      ),
    [act, date, t],
  );

  const add = useCallback(
    (title: string, time: string | null) =>
      act(
        () => api.patchPlan(date, { action: 'add', block: { title, time, type: 'task' } }),
        t('undo.added', { title }),
      ),
    [act, date, t],
  );

  const addBlock = useCallback(
    (target: string, block: Record<string, unknown>) =>
      act(
        () => api.patchPlan(target, { action: 'add', block }),
        t('undo.added', { title: String(block.title ?? '') }),
      ),
    [act, t],
  );

  const answer = useCallback(
    (p: api.Proposal, accept: boolean) =>
      act(
        () => api.respondToProposal(p.id, accept),
        t(accept ? 'undo.accepted' : 'undo.rejected', { title: p.title }),
      ),
    [act, t],
  );

  const take = useCallback(
    (p: api.Proposal, rowID: string) =>
      act(
        () => api.respondToProposalRow(p.id, rowID),
        t('undo.accepted', { title: p.title }),
      ),
    [act, t],
  );

  const takeBack = useCallback(async () => {
    if (!undo) return;
    const id = undo.opId;
    setUndo(null);
    setBusy(true);
    try {
      await api.revertOp(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [undo, refresh]);

  // The three ways out of a 409 locked — each is a real write, so it goes
  // through act (undo + refresh), and clears the refusal on success.
  const unlock = useCallback(
    (b: api.TimeBlock) =>
      act(() => api.lockPlanBlock(date, b.id, 'none'), t('undo.unlocked', { title: b.title })),
    [act, date, t],
  );

  const markConflict = useCallback(
    (b: api.TimeBlock) =>
      act(() => api.markConflict(date, b.id), t('undo.conflicted', { title: b.title })),
    [act, date, t],
  );

  const reschedule = useCallback(
    (b: api.TimeBlock) =>
      act(
        () => api.refishBlock(date, { title: b.title, type: b.type, rescheduled_from: b.id }),
        t('undo.rescheduled', { title: b.title }),
      ),
    [act, date, t],
  );

  const grouped: Grouped = groupDay(plan?.blocks ?? [], { date, today, nowMinutes: tick });

  return {
    date,
    today,
    setDate,
    plan,
    grouped,
    week,
    proposals: proposals.filter((p) => p.state === 'pending'),
    undo,
    refusal,
    busy,
    error,
    setError,
    complete,
    toggleComplete,
    update,
    remove,
    add,
    addBlock,
    answer,
    take,
    takeBack,
    unlock,
    markConflict,
    reschedule,
    refresh,
  };
}

export type Store = ReturnType<typeof useStore>;
