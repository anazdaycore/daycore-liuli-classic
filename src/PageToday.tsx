import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '@daycore/core';
import type { Assignment, Boot, ScheduleRule, TimeBlock } from '@daycore/core';
import type { Store } from './store';
import { Icon } from './Icon';
import { addDays, dayDiff, inRange, monthGrid, pickRange, presetRange, toDate, weekOf, type PlanPreset, type Range } from './days';
import type { Nav } from './App';

// 今日：这一天，以及它前后的那些天。
//
// ⚠️ The one page where the date cursor is visible, and therefore the one that
// makes 初版 a different product from the other three rather than a different
// skin. 汀/纸屿/长卷 each answer "what now"; this answers "what about that day".

function fmtWeekday(iso: string, locale: string): string {
  // ⚠️ Intl, never a hand-rolled table.
  // ⚠️ narrow：zh 是「一二三四五六日」单字，对齐原型周条。
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(toDate(iso));
}

function fmtDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(toDate(iso));
}

function fmtMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(toDate(month + '-01'));
}

function fmtShort(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(toDate(iso));
}

function fmtNow(tz: string): string {
  const m = api.nowMinutesInTZ(tz);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(m / 60))}:${p(m % 60)}`;
}

/** 日历表头：周日开头的七个窄名（zh 为「日一二三四五六」）。 */
function weekdayHeads(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i, 12)));
}

/** 今天 / 明天 / a real date. ⚠️ No 「昨天」 — the past is petrified and a
 *  friendly name for yesterday invites treating it as still-editable. */
function dayLabel(iso: string, today: string, locale: string, t: Boot['catalog']['t']): string {
  const d = dayDiff(today, iso);
  if (d === 0) return t('today.label.today');
  if (d === 1) return t('today.label.tomorrow');
  return fmtDay(iso, locale);
}

const BLOCK_TYPES = ['task', 'appointment', 'break', 'relax', 'meal'] as const;
type BlockType = (typeof BLOCK_TYPES)[number];
const TIME_MODES = ['floating', 'fixed', 'local'] as const;

// ── a bottom-sheet-style modal ──
function Sheet({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="lc-sheet-backdrop" onClick={onClose}>
      <div className="lc-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="lc-sheet-head">
          <h2 className="lc-sheet-title">{title}</h2>
          <button className="lc-sheet-close" onClick={onClose} aria-label="×">×</button>
        </div>
        <div className="lc-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ── a month calendar ──
function Calendar({ month, onMonth, value, range, onPick, min, badges, locale, t }: {
  month: string;
  onMonth: (m: string) => void;
  value?: string;
  range?: Range | null;
  onPick: (d: string) => void;
  min?: string;
  badges?: Record<string, boolean>;
  locale: string;
  t: Boot['catalog']['t'];
}) {
  const heads = weekdayHeads(locale);
  return (
    <div className="lc-cal">
      <div className="lc-calhead">
        <button className="lc-step" onClick={() => onMonth(prevMonth(month))} aria-label={t('today.prevMonth')}><Icon name="chevronLeft" size={16} /></button>
        <span className="lc-caltitle">{fmtMonth(month, locale)}</span>
        <button className="lc-step" onClick={() => onMonth(nextMonth(month))} aria-label={t('today.nextMonth')}><Icon name="chevronRight" size={16} /></button>
      </div>
      <div className="lc-cal-grid lc-cal-heads">
        {heads.map((h, i) => <span key={i} className="lc-calheadcell">{h}</span>)}
      </div>
      <div className="lc-cal-grid">
        {monthGrid(month).map((cell, i) => {
          if (cell === null) return <span key={`p${i}`} className="lc-cell pad" />;
          const selected = value === cell || (range != null && inRange(range, cell));
          const disabled = min != null && cell < min;
          return (
            <button
              key={cell}
              className={'lc-cell' + (selected ? ' on' : '') + (badges?.[cell] ? ' has' : '')}
              disabled={disabled}
              onClick={() => onPick(cell)}
            >
              {Number(cell.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function prevMonth(m: string): string {
  const [y = '1970', mo = '1'] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 2, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(m: string): string {
  const [y = '1970', mo = '1'] = m.split('-');
  const d = new Date(Number(y), Number(mo), 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── block detail ──
function BlockDetailSheet({ block, onClose, store, t, onEditRule }: {
  block: TimeBlock | null;
  onClose: () => void;
  store: Store;
  t: Boot['catalog']['t'];
  onEditRule: (ruleId: string) => void;
}) {
  const [draft, setDraft] = useState<{ title: string; type: BlockType; time: string; duration: string; timeMode: string } | null>(null);
  useEffect(() => {
    setDraft(
      block
        ? { title: block.title, type: block.type, time: block.time ?? '', duration: block.duration_min != null ? String(block.duration_min) : '', timeMode: block.time_mode ?? 'floating' }
        : null,
    );
  }, [block?.id]);

  if (!block || !draft) return null;
  const isRule = !!block.rule_id;
  const dirty =
    draft.title !== block.title ||
    draft.type !== block.type ||
    draft.time !== (block.time ?? '') ||
    draft.duration !== (block.duration_min != null ? String(block.duration_min) : '') ||
    draft.timeMode !== (block.time_mode ?? 'floating');

  function save() {
    void store.update(block!, {
      title: draft!.title.trim() || block!.title,
      type: draft!.type,
      time: draft!.time || null,
      duration_min: draft!.duration ? Number(draft!.duration) : null,
      time_mode: draft!.timeMode,
    });
    onClose();
  }

  const refusal = store.refusal;

  return (
    <Sheet open={!!block} onClose={onClose} title={t('block.detail')}>
      <div className="lc-detail-actions-top">
        <span className="lc-tag">{t(block.origin === 'auto' ? 'block.origin.auto' : isRule ? 'block.origin.rule' : 'block.origin.manual')}</span>
        {block.lock_level === 'hard' && <span className="lc-tag warn">{t('block.locked')}</span>}
      </div>

      <label className="lc-field">
        <span className="lc-field-label">{t('block.name')}</span>
        <input className="lc-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </label>

      <div className="lc-field">
        <span className="lc-field-label">{t('block.typeLabel')}</span>
        <div className="lc-seg">
          {BLOCK_TYPES.map((ty) => (
            <button key={ty} className={'lc-segitem' + (draft.type === ty ? ' on' : '')} onClick={() => setDraft({ ...draft, type: ty })}>
              {t(`block.type.${ty}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="lc-grid2">
        <label className="lc-field">
          <span className="lc-field-label">{t('block.timeLabel')}</span>
          <input className="lc-input" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
        </label>
        <label className="lc-field">
          <span className="lc-field-label">{t('block.durationLabel')}</span>
          <input className="lc-input" type="number" min="5" step="5" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} />
        </label>
      </div>

      <div className="lc-field">
        <span className="lc-field-label">{t('block.timeModeLabel')}</span>
        <div className="lc-seg">
          {TIME_MODES.map((m) => (
            <button key={m} className={'lc-segitem' + (draft.timeMode === m ? ' on' : '')} onClick={() => setDraft({ ...draft, timeMode: m })}>
              {t(`block.timeMode.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {refusal && (
        <div className="lc-refusal">
          <p className="lc-err">{store.error}</p>
          <div className="lc-actrow">
            {refusal.code === 'locked' && (
              <>
                <button className="lc-btn sec" onClick={() => void store.unlock(block)}>{t('block.unlock')}</button>
                <button className="lc-btn sec" onClick={() => void store.markConflict(block)}>{t('block.markConflict')}</button>
              </>
            )}
            {refusal.code !== 'refish_capped' && (
              <button className="lc-btn sec" onClick={() => void store.reschedule(block)}>{t('block.reschedule')}</button>
            )}
          </div>
        </div>
      )}

      <div className="lc-sheet-actions">
        <button className="lc-btn sec" disabled={store.busy} onClick={() => void store.toggleComplete(block)}>
          {block.completed ? t('block.uncomplete') : t('block.complete')}
        </button>
        <button className="lc-btn pri" disabled={!dirty || store.busy} onClick={save}>{t('common.save')}</button>
      </div>
      {isRule && (
        <button className="lc-btn sec lc-full" onClick={() => { onClose(); onEditRule(block.rule_id!); }}>
          {t('block.editRule')}
        </button>
      )}
      <button className="lc-btn sec lc-muted lc-full" disabled={store.busy} onClick={() => { void store.remove(block); onClose(); }}>
        {isRule ? t('block.hideToday') : t('block.remove')}
      </button>
      {isRule && <p className="lc-sub lc-center">{t('block.hideSub')}</p>}
    </Sheet>
  );
}
// ── auto-plan ──
function AutoPlanSheet({ open, onClose, store, t, locale, rulesCount, dueCount, facts, goMaterials }: {
  open: boolean;
  onClose: () => void;
  store: Store;
  t: Boot['catalog']['t'];
  locale: string;
  rulesCount: number;
  dueCount: number;
  facts: string[];
  goMaterials: () => void;
}) {
  const [preset, setPreset] = useState<PlanPreset | 'custom'>('today');
  const [custom, setCustom] = useState<Range | null>(null);
  const [month, setMonth] = useState(() => store.date.slice(0, 7));
  const [instructions, setInstructions] = useState('');
  const [mode, setMode] = useState<'keep_manual' | 'replace_all'>('keep_manual');
  const [phase, setPhase] = useState<'form' | 'gen'>('form');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setPhase('form'); setErr(''); setNote(''); } }, [open]);

  const resolved = useMemo(() => {
    if (preset !== 'custom') return presetRange(preset, store.today);
    return custom && custom.to ? { from: custom.from, to: custom.to } : null;
  }, [preset, custom, store.today]);

  function pickDay(d: string) { setCustom((c) => pickRange(c, d)); }

  async function submit() {
    if (!resolved) return;
    setPhase('gen');
    setErr('');
    setNote('');
    try {
      const res = await api.autoPlan({
        from: resolved.from,
        to: resolved.to,
        date: store.date,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        instructions: instructions.trim(),
        mode,
      });
      if (res.error) {
        setPhase('form');
        setErr(res.error === 'no_material' ? 'no_material' : String(res.message ?? res.error));
        return;
      }
      await store.refresh();
      setNote(String(res.note ?? t('today.plan.done')));
      setPhase('form');
      onClose();
    } catch (e) {
      setPhase('form');
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const rangeLabel = resolved ? (resolved.from === resolved.to ? t('today.plan.rangeOne', { d: fmtShort(resolved.from, locale) }) : t('today.plan.rangeN', { from: fmtShort(resolved.from, locale), to: fmtShort(resolved.to, locale), n: dayDiff(resolved.to, resolved.from) + 1 })) : '';

  return (
    <Sheet open={open} onClose={onClose} title={t('today.plan.title')}>
      {phase === 'gen' ? (
        <div className="lc-genoverlay">
          <span className="lc-spin" aria-hidden="true" />
          <span>{t('today.plan.running')}</span>
        </div>
      ) : (
        <>
          {(rulesCount > 0 || dueCount > 0 || facts.length > 0) && (
            <div className="lc-chips">
              {rulesCount > 0 && <span className="lc-chip">{t('today.plan.summary.rules', { n: rulesCount })}</span>}
              {dueCount > 0 && <span className="lc-chip">{t('today.plan.summary.due', { n: dueCount })}</span>}
              {facts.slice(0, 2).map((f, i) => <span key={i} className="lc-chip">{f}</span>)}
            </div>
          )}
          <div className="lc-field">
            <span className="lc-field-label">{t('today.plan.range')} <span className="lc-field-sub">{rangeLabel}</span></span>
            <div className="lc-seg">
              {(['today', 'tomorrow', 'd3', 'week', 'custom'] as const).map((p) => (
                <button key={p} className={'lc-segitem' + (preset === p ? ' on' : '')} onClick={() => setPreset(p)}>
                  {t(`today.plan.range.${p}`)}
                </button>
              ))}
            </div>
          </div>
          {preset === 'custom' && (
            <Calendar month={month} onMonth={setMonth} range={custom} onPick={pickDay} min={store.today} locale={locale} t={t} />
          )}
          <label className="lc-field">
            <span className="lc-field-label">{t('today.plan.instructions')}</span>
            <textarea className="lc-input lc-textarea" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
          <div className="lc-field">
            <span className="lc-field-label">{t('today.plan.mode')}</span>
            <div className="lc-modeopts">
              <button className={'lc-modeopt' + (mode === 'keep_manual' ? ' on' : '')} onClick={() => setMode('keep_manual')}>
                <span className="lc-modeopt-title">{t('today.plan.mode.keep')}</span>
                <span className="lc-modeopt-sub">{t('today.plan.mode.keepSub')}</span>
              </button>
              <button className={'lc-modeopt' + (mode === 'replace_all' ? ' on' : '')} onClick={() => setMode('replace_all')}>
                <span className="lc-modeopt-title">{t('today.plan.mode.replace')}</span>
                <span className="lc-modeopt-sub">{t('today.plan.mode.replaceSub')}</span>
              </button>
            </div>
          </div>
          {err && (
            <div className="lc-plan-note">
              <p className="lc-sub">{err === 'no_material' ? t('today.plan.noMaterial') : err}</p>
              {err === 'no_material' && (
                <button className="lc-btn sec" onClick={goMaterials}>{t('today.plan.goImport')}</button>
              )}
            </div>
          )}
          {note && <p className="lc-sub">{note}</p>}
          <div className="lc-sheet-actions">
            <button className="lc-btn sec" onClick={onClose}>{t('common.cancel')}</button>
            <button className="lc-btn pri" disabled={!resolved} onClick={() => void submit()}>{t('today.plan.start')}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ── manual add (natural-language) ──
interface Candidate { block: TimeBlock; checked: boolean; }

function ManualAddSheet({ open, onClose, date, store, t, locale }: {
  open: boolean;
  onClose: () => void;
  date: string;
  store: Store;
  t: Boot['catalog']['t'];
  locale: string;
}) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState(date);
  const [busy, setBusy] = useState(false);
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setText(''); setCands(null); setErr(''); setTarget(date); } }, [open, date]);

  const targets = useMemo(() => [store.today, addDays(store.today, 1)].filter((d, i, a) => a.indexOf(d) === i), [store.today]);

  async function parse() {
    setBusy(true); setErr('');
    try {
      const res = await api.planFromText({
        description: text.trim(),
        date: store.today,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        targetDate: target,
      });
      if (res.error) { setErr(String(res.message ?? res.error)); return; }
      setCands((res.blocks ?? []).map((b) => ({ block: b, checked: true })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const picked = (cands ?? []).filter((c) => c.checked);
    for (const c of picked) {
      const b = c.block;
      await store.addBlock(target, {
        title: b.title,
        type: b.type,
        ...(b.time ? { time: b.time } : {}),
        ...(b.duration_min != null ? { duration_min: b.duration_min } : {}),
        ...(b.time_mode ? { time_mode: b.time_mode } : {}),
        ...(b.timezone ? { timezone: b.timezone } : {}),
      });
    }
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('today.add')}>
      {!cands ? (
        <>
          <div className="lc-field">
            <span className="lc-field-label">{t('today.add.target')}</span>
            <div className="lc-seg">
              {targets.map((d) => (
                <button key={d} className={'lc-segitem' + (target === d ? ' on' : '')} onClick={() => setTarget(d)}>
                  {dayLabel(d, store.today, locale, t)}
                </button>
              ))}
            </div>
          </div>
          <label className="lc-field">
            <span className="lc-field-label">{t('today.add.textLabel')}</span>
            <textarea className="lc-input lc-textarea" rows={3} placeholder={t('today.add.textPh')} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {err && <p className="lc-err">{err}</p>}
          <div className="lc-sheet-actions">
            <button className="lc-btn sec" onClick={onClose}>{t('common.cancel')}</button>
            <button className="lc-btn pri" disabled={busy || !text.trim()} onClick={() => void parse()}>
              {busy ? t('today.add.parsing') : t('today.add.parse')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="lc-sub">{t('today.add.candidates')}</p>
          <div className="lc-list">
            {cands.map((c, i) => (
              <button key={c.block.id || i} className={'lc-card lc-cand' + (c.checked ? ' on' : '')} onClick={() => setCands(cands.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}>
                <span className="lc-candcheck">{c.checked ? <Icon name="check" size={13} /> : null}</span>
                <span className="lc-candbody">
                  <span className="lc-cardtitle">{c.block.title}</span>
                  <span className="lc-sub">
                    {c.block.time ?? t('block.noTime')}
                    {c.block.duration_min != null ? ' · ' + t('block.minutes', { n: c.block.duration_min }) : ''}
                    {' · ' + t(`block.type.${c.block.type}`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="lc-sheet-actions">
            <button className="lc-btn sec" onClick={() => setCands(null)}>{t('common.back')}</button>
            <button className="lc-btn pri" disabled={!cands.some((c) => c.checked)} onClick={() => void confirm()}>
              {t('today.add.confirm', { n: cands.filter((c) => c.checked).length })}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ── the page ──
export function PageToday({ boot, store, nav }: { boot: Boot; store: Store; nav: Nav }) {
  const t = boot.catalog.t;
  const locale = boot.catalog.locale;
  const TZ = api.sessionTimezone(boot.session);
  const [apOpen, setApOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpMonth, setJumpMonth] = useState(() => store.date.slice(0, 7));
  const [sideMonth, setSideMonth] = useState(() => store.date.slice(0, 7));
  const [detail, setDetail] = useState<TimeBlock | null>(null);
  const [upcoming, setUpcoming] = useState<Assignment[]>([]);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [facts, setFacts] = useState<string[]>([]);

  const { timed, nowIndex, floating } = store.grouped;
  const done = timed.filter((b) => b.completed).length + floating.filter((b) => b.completed).length;
  const total = timed.length + floating.length;

  // Sidebar data: upcoming (0–14 days) + rules count + key facts.
  useEffect(() => {
    let live = true;
    const to = addDays(store.today, 14);
    void Promise.all([api.assignments({ from: store.today, to }), api.rules(), api.memory()])
      .then(([a, r, m]) => {
        if (!live) return;
        setUpcoming(
          (a.assignments ?? [])
            .filter((x) => x.status === 'pending' && x.dueAt)
            .sort((x, y) => (x.dueAt! < y.dueAt! ? -1 : 1)),
        );
        setRules(r.rules ?? []);
        setFacts((m.facts ?? []).map((f) => f.fact));
      })
      .catch(() => { if (live) { setUpcoming([]); setRules([]); setFacts([]); } });
    return () => { live = false; };
  }, [store.today]);

  const sideBadges = useMonthBadges(sideMonth);
  const jumpBadges = useMonthBadges(jumpMonth);

  const dueLabel = (dd: number) => (dd === 0 ? t('today.side.dueToday') : dd === 1 ? t('today.side.dueTomorrow') : t('today.side.dueIn', { n: dd }));

  return (
    <div className="lc-today-grid">
      <div className="lc-today-main">
        <div className="lc-strip" role="group" aria-label={t('today.week')}>
          <button className="lc-step" aria-label={t('today.prevWeek')} onClick={() => store.setDate(addDays(store.date, -7))}><Icon name="chevronLeft" size={16} /></button>
          <div className="lc-week-days">
            {weekOf(store.date).map((d, i) => {
              const cell = store.week[i];
              return (
                <button key={d} className={'lc-day' + (d === store.date ? ' on' : '') + (d === store.today ? ' today' : '')} onClick={() => store.setDate(d)} aria-current={d === store.date ? 'date' : undefined}>
                  <span className="lc-dayname">{fmtWeekday(d, locale)}</span>
                  <span className="lc-daynum">{Number(d.slice(8))}</span>
                  <span className={'lc-daydot' + (cell && !cell.empty && cell.total > 0 ? (cell.done === cell.total ? ' full' : ' some') : '')} />
                </button>
              );
            })}
          </div>
          <button className="lc-step" aria-label={t('today.nextWeek')} onClick={() => store.setDate(addDays(store.date, 7))}><Icon name="chevronRight" size={16} /></button>
          <button className="lc-step" aria-label={t('today.monthJump')} onClick={() => { setJumpMonth(store.date.slice(0, 7)); setJumpOpen(true); }}><Icon name="calendarDays" size={16} /></button>
        </div>

        <div className="lc-today-head">
          <div className="lc-row8">
            <h1 className="lc-title">{dayLabel(store.date, store.today, locale, t)}</h1>
            {store.date !== store.today && <button className="lc-btn sec" onClick={() => store.setDate(store.today)}>{t('today.backToToday')}</button>}
          </div>
          {total > 0 && <span className="lc-progress-pill"><Icon name="checkCircle" size={13} /> {t('today.progress', { done, total })}</span>}
        </div>

        {store.error && <p className="lc-err">{store.error}</p>}

        {store.proposals.map((p) => (
          <article key={p.id} className="lc-card ghost">
            <h2 className="lc-cardtitle">{p.title}</h2>
            {p.summary && <p className="lc-sub">{p.summary}</p>}
            <div className="lc-actrow">
              {p.rows?.length ? (
                p.rows.map((row) => (
                  <button key={row.id} className="lc-btn sec" disabled={store.busy} onClick={() => void store.take(p, row.id)}>{row.label}</button>
                ))
              ) : (
                <>
                  <button className="lc-btn pri" disabled={store.busy} onClick={() => void store.answer(p, true)}>{t('proposal.accept')}</button>
                  <button className="lc-btn sec" disabled={store.busy} onClick={() => void store.answer(p, false)}>{t('proposal.reject')}</button>
                </>
              )}
            </div>
          </article>
        ))}

        <button className="lc-hero" onClick={() => setApOpen(true)}>
          <span className="lc-hero-ic"><Icon name="sparkles" size={22} /></span>
          <span className="lc-hero-body">
            <span className="lc-hero-title">{t('today.autoPlan')}</span>
            <span className="lc-hero-sub">{t('today.autoPlanSub')}</span>
          </span>
          <Icon name="chevronRight" size={19} />
        </button>
        <div className="lc-actrow">
          <button className="lc-btn sec lc-dashed" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> {t('today.add')}</button>
        </div>

        {total === 0 ? (
          <p className="lc-empty">{t('today.empty')}</p>
        ) : (
          <ul className="lc-list">
            {timed.map((b, i) => (
              <li key={b.id}>
                {nowIndex === i && <div className="lc-now"><span className="lbl">{t('today.now')} {fmtNow(TZ)}</span><span className="line" /></div>}
                <BlockRow b={b} store={store} t={t} onOpen={() => setDetail(b)} />
              </li>
            ))}
            {nowIndex === timed.length && timed.length > 0 && <li><div className="lc-now"><span className="lbl">{t('today.now')} {fmtNow(TZ)}</span><span className="line" /></div></li>}
            {floating.length > 0 && <li className="lc-groupsep">{t('today.untimed')}</li>}
            {floating.map((b) => (
              <li key={b.id}><BlockRow b={b} store={store} t={t} onOpen={() => setDetail(b)} /></li>
            ))}
          </ul>
        )}
      </div>

      <aside className="lc-side">
        <section className="lc-sidecard">
          <Calendar month={sideMonth} onMonth={setSideMonth} value={store.date} onPick={(d) => store.setDate(d)} badges={sideBadges} locale={locale} t={t} />
        </section>
        {total > 0 && (
          <section className="lc-sidecard">
            <div className="lc-sidehead">{t('today.side.progress')} <span className="lc-sidenum">{done}/{total}</span></div>
            <div className="lc-bar"><i style={{ width: Math.round((done / total) * 100) + '%' }} /></div>
          </section>
        )}
        <section className="lc-sidecard">
          <div className="lc-sidehead">{t('today.side.upcoming')}</div>
          {upcoming.length === 0 ? (
            <p className="lc-sideempty">{t('today.side.none')}</p>
          ) : (
            <ul className="lc-list">
              {upcoming.slice(0, 5).map((a) => {
                const dd = dayDiff(store.today, a.dueAt!.slice(0, 10));
                return (
                  <li key={a.id} className="lc-sidedue">
                    <span className="lc-sidedue-title">{a.title}</span>
                    <span className={'lc-sidedue-dd' + (dd <= 1 ? ' hot' : dd <= 3 ? ' warm' : '')}>{dueLabel(dd)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      <AutoPlanSheet open={apOpen} onClose={() => setApOpen(false)} store={store} t={t} locale={locale} rulesCount={rules.filter((r) => r.active).length} dueCount={upcoming.length} facts={facts} goMaterials={() => nav.go('materials')} />
      <ManualAddSheet open={addOpen} onClose={() => setAddOpen(false)} date={store.date} store={store} t={t} locale={locale} />
      <BlockDetailSheet block={detail} onClose={() => setDetail(null)} store={store} t={t} onEditRule={() => { setDetail(null); nav.go('materials', { rules: '1' }); }} />
      <Sheet open={jumpOpen} onClose={() => setJumpOpen(false)} title={t('today.monthJump')}>
        <Calendar month={jumpMonth} onMonth={setJumpMonth} value={store.date} onPick={(d) => { store.setDate(d); setJumpOpen(false); }} badges={jumpBadges} locale={locale} t={t} />
        <div className="lc-sheet-actions">
          <button className="lc-btn sec" onClick={() => { store.setDate(store.today); setJumpOpen(false); }}>{t('today.backToToday')}</button>
        </div>
      </Sheet>
    </div>
  );
}

function BlockRow({ b, store, t, onOpen }: { b: TimeBlock; store: Store; t: Boot['catalog']['t']; onOpen: () => void }) {
  return (
    <article className={'lc-block' + (b.completed ? ' done' : '') + (b.rule_id ? ' rule' : '')}>
      <button className="lc-block-tap" onClick={onOpen} aria-label={b.title}>
        <span className="lc-block-time">{b.time || t('block.noTime')}</span>
        <span className="lc-block-main">
          <span className="lc-block-title">{b.title}</span>
          <span className="lc-block-meta">
            {b.duration_min != null && <span>{t('block.minutes', { n: b.duration_min })}</span>}
            {b.rule_id && <span className="lc-rulemark"><Icon name="repeat" size={13} /></span>}
            {b.time_mode === 'fixed' && <span className="lc-tag">{t('block.fixed')}</span>}
          </span>
        </span>
      </button>
      <button className={'lc-complete' + (b.completed ? ' on' : '')} aria-label={t('block.complete')} disabled={store.busy} onClick={() => void store.toggleComplete(b)}>
        <Icon name="check" size={16} />
      </button>
    </article>
  );
}

function useMonthBadges(month: string): Record<string, boolean> {
  const [badges, setBadges] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let live = true;
    const cells = monthGrid(month);
    const days = cells.filter((c): c is string => c !== null);
    if (days.length === 0) return;
    void api.planRange(days[0]!, days[days.length - 1]!)
      .then((plans) => {
        if (!live) return;
        const map: Record<string, boolean> = {};
        for (const p of plans ?? []) if (p.blocks.length > 0) map[p.date] = true;
        setBadges(map);
      })
      .catch(() => { if (live) setBadges({}); });
    return () => { live = false; };
  }, [month]);
  return badges;
}
