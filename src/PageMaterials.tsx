import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as api from '@daycore/core';
import type { Assignment, Boot, Course, Material, MaterialCategory, ScheduleRule } from '@daycore/core';
import { Icon } from './Icon';
import type { Nav } from './App';
import { dayDiff } from './days';
import { describeRule } from './rules';

// 资料：记下来的东西、还欠着的作业、数据源、每周都会发生的事。
// 对照原型 page-materials.jsx + materials-parts.jsx + capture-flow.jsx 加厚。

export const MATERIAL_TABS = ['notes', 'work', 'sources'] as const;
type Tab = (typeof MATERIAL_TABS)[number];

// 后端 materialCategories().icon 取值 → 本端图标名（design-ui 同类 path）。
const CATEGORY_ICON: Record<string, string> = {
  note: 'notebookPen',
  diet: 'utensils',
  health: 'heartPulse',
  academic: 'graduationCap',
  travel: 'plane',
  finance: 'wallet',
  fitness: 'dumbbell',
  idea: 'lightbulb',
  shopping: 'shoppingBag',
  media: 'film',
};

const KNOWN_SOURCE = new Set(['user', 'chat', 'import', 'photo', 'canvas', 'ics', 'image']);

function catIcon(c: MaterialCategory): string {
  return CATEGORY_ICON[c.icon] ?? 'notebookPen';
}

function relWhen(iso: string, today: string, locale: string, t: Boot['catalog']['t']): string {
  const d = dayDiff(today, iso.slice(0, 10));
  if (d === 0) return t('materials.relToday');
  if (d === 1) return t('materials.relYesterday');
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(iso));
}

function dueMeta(a: Assignment, today: string, t: Boot['catalog']['t']): { cls: string; label: string } | null {
  if (!a.dueAt) return null;
  const d = dayDiff(today, a.dueAt.slice(0, 10));
  if (d < 0) return { cls: 'hot', label: t('materials.overdue', { n: -d }) };
  if (d === 0) return { cls: 'hot', label: t('today.side.dueToday') };
  if (d === 1) return { cls: 'warm', label: t('today.side.dueTomorrow') };
  return { cls: d <= 3 ? 'warm' : '', label: t('today.side.dueIn', { n: d }) };
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
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

function Empty({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="lc-empty">
      <Icon name={icon} size={28} />
      <p className="lc-sub" style={{ fontWeight: 600 }}>{title}</p>
      {desc && <p className="lc-sub">{desc}</p>}
    </div>
  );
}

export function PageMaterials({ boot, nav }: { boot: Boot; nav: Nav }) {
  const t = boot.catalog.t;
  const locale = boot.catalog.locale;
  const today = api.todayIso();
  const [tab, setTab] = useState<Tab>('notes');
  const [rulesMode, setRulesMode] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [cats, setCats] = useState<MaterialCategory[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [capText, setCapText] = useState('');
  const [asgFilter, setAsgFilter] = useState('pending');
  const [notice, setNotice] = useState('');
  const [work, setWork] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [detail, setDetail] = useState<Material | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addBody, setAddBody] = useState('');
  const [addCat, setAddCat] = useState('note');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 数据源
  const [token, setToken] = useState('');
  const [canvasMsg, setCanvasMsg] = useState('');
  const [icsMsg, setIcsMsg] = useState('');
  const [icsText, setIcsText] = useState('');
  const [icsCands, setIcsCands] = useState<{ title: string; time?: string; duration_min?: number; freq?: string }[] | null>(null);
  const [icsWarnings, setIcsWarnings] = useState<string[]>([]);
  const [tzAsk, setTzAsk] = useState<{ calendarTimezone: string; sessionTimezone: string; events: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, c, a, co, r] = await Promise.all([
        api.materials(cat),
        api.materialCategories(),
        api.assignments(),
        api.courses(),
        api.rules(),
      ]);
      setMaterials(m.materials ?? []);
      setCats(c.categories ?? []);
      setWork(a.assignments ?? []);
      setCourses(co.courses ?? []);
      setRules(r.rules ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cat]);

  useEffect(() => {
    void load();
  }, [load]);

  async function guard(run: () => Promise<unknown>) {
    setBusy(true);
    try {
      await run();
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addOne() {
    if (!addTitle.trim()) return;
    setBusy(true);
    try {
      await api.createMaterial({ title: addTitle.trim(), body: addBody.trim(), category: addCat, source: 'user' });
      setAddTitle('');
      setAddBody('');
      setAddCat('note');
      setAddOpen(false);
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const notify = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

  async function capSend() {
    const v = capText.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await api.createMaterial({ title: v.slice(0, 18), body: v, category: 'note', source: 'user' });
      setCapText('');
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const filteredWork = useMemo(() => {
    if (asgFilter === 'all') return work;
    if (asgFilter === 'pending') return work.filter((a) => a.status === 'pending' || a.status === 'planned');
    return work.filter((a) => a.status === asgFilter);
  }, [work, asgFilter]);

  const canvasRef = useRef<HTMLInputElement>(null);
  const icsRef = useRef<HTMLInputElement>(null);

  async function loadToken() {
    try {
      const r = await api.importToken();
      setToken(r.token ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (tab === 'sources') void loadToken();
  }, [tab]);

  // 原型规则入口：BlockDetailSheet「编辑规则」→ nav.go('materials',{rules,editRule})。
  useEffect(() => {
    if (nav.params.rules) setRulesMode(true);
  }, [nav.params]);

  async function rotateToken() {
    setBusy(true);
    try {
      const r = await api.rotateImportToken();
      setToken(r.token ?? '');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function canvasFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCanvasMsg('');
    setBusy(true);
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as { version?: string };
      if (!parsed.version) { setCanvasMsg(t('materials.canvasBad')); return; }
      const res = await api.importCanvas(parsed as Parameters<typeof api.importCanvas>[0]) as { courses?: number; assignments?: number };
      setCanvasMsg(t('materials.canvasDone', { c: res.courses ?? 0, a: res.assignments ?? 0 }));
      await load();
    } catch (e) {
      setCanvasMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
    e.target.value = '';
  }

  async function icsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setIcsMsg('');
    setBusy(true);
    try {
      const text = await f.text();
      setIcsText(text);
      const res = await api.importICS(text, { preview: true }) as { rules?: { title: string; time?: string; duration_min?: number; freq?: string }[]; warnings?: string[] };
      setIcsCands(res.rules ?? []);
      setIcsWarnings(res.warnings ?? []);
    } catch (e) {
      setIcsMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
    e.target.value = '';
  }

  async function confirmIcs() {
    if (!icsText) return;
    setBusy(true);
    setIcsMsg('');
    try {
      await api.importICS(icsText);
      setIcsCands(null);
      setIcsText('');
      setIcsMsg(t('materials.icsDone'));
      await load();
    } catch (e) {
      const err = e as { status?: number; body?: unknown };
      if (err.status === 409) {
        const b = err.body as { calendarTimezone?: string; sessionTimezone?: string; events?: number } | null;
        setTzAsk({ calendarTimezone: b?.calendarTimezone ?? '', sessionTimezone: b?.sessionTimezone ?? '', events: b?.events ?? 0 });
      } else {
        setIcsMsg(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmTz() {
    if (!icsText || !tzAsk) return;
    setBusy(true);
    setIcsMsg('');
    try {
      await api.importICS(icsText, { timezone: tzAsk.calendarTimezone, tzConfirmed: true });
      setIcsCands(null);
      setIcsText('');
      setTzAsk(null);
      setIcsMsg(t('materials.icsDone'));
      await load();
    } catch (e) {
      setIcsMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const enabledCats = cats.filter((c) => c.enabled);
  const catName = (id: string) => { const v = t(`cat.${id}`); return v === `cat.${id}` ? (cats.find((c) => c.id === id)?.name ?? id) : v; };
  const feed = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return materials;
    return materials.filter((m) =>
      (m.title || '').toLowerCase().includes(ql) ||
      (m.body || '').toLowerCase().includes(ql) ||
      (m.summary || '').toLowerCase().includes(ql),
    );
  }, [materials, q]);

  if (rulesMode) {
    return (
      <div className="lc-page">
        <div className="lc-row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <button className="lc-btn sec" onClick={() => setRulesMode(false)}><Icon name="chevronLeft" size={16} /> {t('common.back')}</button>
          <h2 className="lc-title">{t('materials.rulesTitle')}</h2>
        </div>
        {rules.length === 0 ? (
          <Empty icon="repeat" title={t('materials.noRules')} />
        ) : (
          <ul className="lc-list">
            {rules.map((r) => {
              const parts = describeRule(r, locale);
              return (
                <li key={r.id}>
                  <article className={'lc-card' + (r.active ? '' : ' done')}>
                    <div className="lc-cardmain">
                      <span className="lc-cardtitle">{r.title}</span>
                      {r.time && <span className="lc-time">{r.time}</span>}
                    </div>
                    <p className="lc-sub">{parts.map((p) => <span key={p.key} className="lc-part">{t(p.key, p.vars)}</span>)}</p>
                    <div className="lc-actrow">
                      <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.patchRule(r.id, { active: !r.active }))}>{t(r.active ? 'rules.pause' : 'rules.resume')}</button>
                      <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.deleteRule(r.id))}>{t('common.delete')}</button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="lc-page">
      <div className="lc-sechead">
        <h1 className="lc-sechead-title">{t('materials.title')}</h1>
        <p className="lc-sechead-sub">{t('materials.subtitle')}</p>
      </div>

      {/* ── 顶部随手记（常驻） ── */}
      <div className="lc-capture">
        <textarea rows={1} placeholder={t('materials.capPh')} value={capText}
          onChange={(e) => setCapText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void capSend(); } }} />
        <div className="lc-cap-actions">
          <button className="lc-cap-cam" onClick={() => notify(t('materials.capCamSoon'))}><Icon name="camera" size={16} /> {t('materials.capCamera')}</button>
          <div style={{ flex: 1 }} />
          <button className="lc-send-btn" disabled={!capText.trim() || busy} aria-label={t('materials.capCamera')} onClick={() => void capSend()}><Icon name="arrowUp" size={17} /></button>
        </div>
      </div>
      <div className="lc-chips">
        <button className="lc-chip" onClick={() => setCapText(t('materials.capHint1'))}>{t('materials.capHint1')}</button>
        <button className="lc-chip" onClick={() => setCapText(t('materials.capHint2'))}>{t('materials.capHint2')}</button>
        <button className="lc-chip" onClick={() => setCapText(t('materials.capHint3'))}>{t('materials.capHint3')}</button>
      </div>
      <div className="lc-actrow">
        <button className="lc-btn sec" onClick={() => setTab('sources')}>{t('materials.importCanvas')}</button>
        <button className="lc-btn sec" onClick={() => setTab('sources')}>{t('materials.importIcs')}</button>
        <button className="lc-btn sec" onClick={() => notify(t('materials.shotSoon'))}>{t('materials.shot')}</button>
        <button className="lc-link" onClick={() => setTab('sources')}>{t('materials.allSources')}</button>
      </div>

      <div className="lc-seg" role="tablist">
        {MATERIAL_TABS.map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={'lc-segitem' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
            {t(`materials.tab.${id}`)}
          </button>
        ))}
      </div>

      {error && <p className="lc-err">{error}</p>}

      {tab === 'notes' && (
        <>
          <div className="lc-feed-search">
            <Icon name="search" size={16} />
            <input placeholder={t('materials.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('materials.searchPh')} />
            {q && <button className="lc-feed-clear" aria-label="×" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}
          </div>
          <div className="lc-chips">
            <button className={'lc-chip' + (cat === '' ? ' on' : '')} onClick={() => setCat('')}>{t('materials.allCategories')}</button>
            {enabledCats.map((c) => (
              <button key={c.id} className={'lc-chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>
                {catName(c.id)}{' ' + materials.filter((m) => m.category === c.id).length}
              </button>
            ))}
          </div>
          <button className="lc-btn sec lc-full" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={16} /> {t('materials.addOne')}
          </button>
          {feed.length === 0 ? (
            <Empty icon="inbox" title={q ? t('materials.feedNoResults') : t('materials.empty')} desc={q ? undefined : t('materials.feedEmptyDesc')} />
          ) : (
            <ul className="lc-list">
              {feed.map((m) => {
                const c = cats.find((x) => x.id === m.category);
                return (
                  <li key={m.id}>
                    <button className="lc-matrow" onClick={() => setDetail(m)}>
                      <span className="lc-cat-ic" style={c ? { background: 'color-mix(in srgb, var(--primary) 11%, transparent)' } : undefined}><Icon name={c ? catIcon(c) : 'notebookPen'} size={17} /></span>
                      <span className="lc-matrow-main">
                        <span className="lc-matrow-title">{m.title}</span>
                        {(m.body || m.summary) && <span className="lc-matrow-sum">{m.summary || m.body}</span>}
                        <span className="lc-matrow-meta">
                          <span className="cat">{catName(m.category)}</span>
                          {KNOWN_SOURCE.has(m.source) && m.source !== 'user' && <span>{t(`materials.source.${m.source}`)}</span>}
                          <span>{relWhen(m.created_at, today, locale, t)}</span>
                        </span>
                      </span>
                      <Icon name="chevronRight" size={17} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {tab === 'work' && (
        <>
          <div className="lc-row" style={{ padding: 0, flexWrap: 'wrap' }}>
            <h3 className="lc-cardtitle" style={{ margin: 0 }}>{t('materials.assignments')}</h3>
            <div className="lc-chips">
              {(['pending', 'all', 'done', 'dismissed'] as const).map((f) => (
                <button key={f} className={'lc-chip' + (asgFilter === f ? ' on' : '')} onClick={() => setAsgFilter(f)}>{t(f === 'pending' ? 'materials.asgFilterPending' : f === 'all' ? 'materials.asgFilterAll' : f === 'done' ? 'materials.asgFilterDone' : 'materials.asgFilterDismissed')}</button>
              ))}
            </div>
          </div>
          <button className="lc-btn sec lc-dashed lc-full" onClick={() => notify(t('materials.asgAddSoon'))}><Icon name="plus" size={16} /> {t('materials.asgAddDeadline')}</button>
          {filteredWork.length === 0 ? (
            <Empty icon="bookOpen" title={t('materials.noWork')} />
          ) : (
            <ul className="lc-list">
              {filteredWork.map((a) => {
                const due = dueMeta(a, today, t);
                const done = a.status === 'done' || a.submitted;
                const course = courses.find((c) => c.id === a.courseId);
                return (
                  <li key={a.id}>
                    <article className={'lc-card' + (done ? ' done' : '')}>
                      <div className="lc-cardmain">
                        {course?.courseCode && <span className="lc-course-code">{course.courseCode}</span>}
                        <span className="lc-cardtitle">{a.title}</span>
                      </div>
                      <div className="lc-matrow-meta">
                        {due && <span className={'lc-due ' + due.cls}>{due.label}</span>}
                        {a.pointsPossible != null && <span>{t('materials.points', { n: a.pointsPossible })}</span>}
                        {a.status === 'planned' && <span>{t('materials.plannedHint')}</span>}
                      </div>
                      <div className="lc-asg-actions">
                        {a.status !== 'done' && a.status !== 'dismissed' && (
                          <>
                            <button className="lc-asg-icon" aria-label={t('materials.markDone')} disabled={busy} onClick={() => void guard(() => api.patchAssignment(a.id, { status: 'done' }))}><Icon name="check" size={16} /></button>
                            <button className="lc-asg-icon" aria-label={t('materials.asgDismiss')} disabled={busy} onClick={() => void guard(() => api.patchAssignment(a.id, { status: 'dismissed' }))}><Icon name="eyeOff" size={15} /></button>
                          </>
                        )}
                        {(a.status === 'done' || a.status === 'dismissed') && (
                          <button className="lc-asg-icon" aria-label={t('materials.asgRestore')} disabled={busy} onClick={() => void guard(() => api.patchAssignment(a.id, { status: 'pending' }))}><Icon name="refreshCw" size={15} /></button>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {tab === 'sources' && (
        <div className="lc-mat-grid">
          <article className="lc-card lc-mat-card">
            <span className="lc-mat-ic"><Icon name="graduationCap" size={20} /></span>
            <div className="lc-mat-body">
              <h3 className="lc-mat-title">{t('materials.canvasTitle')}</h3>
              <p className="lc-mat-desc">{t('materials.canvasDesc')}</p>
              <div className="lc-token-box">
                <Icon name="key" size={16} />
                <span>{token || t('materials.tokenNone')}</span>
                <button className="lc-btn sec" disabled={busy} onClick={() => void rotateToken()}>{token ? t('materials.tokenRotate') : t('materials.tokenGenerate')}</button>
              </div>
              <p className="lc-sub">{t('materials.tokenDesc')}</p>
              <button className="lc-btn sec" disabled={busy} onClick={() => canvasRef.current?.click()}>{t('materials.canvasUpload')}</button>
              <input ref={canvasRef} type="file" accept=".json,application/json" hidden onChange={(e) => void canvasFile(e)} />
              {canvasMsg && <p className="lc-sub">{canvasMsg}</p>}
            </div>
          </article>
          <article className="lc-card lc-mat-card">
            <span className="lc-mat-ic"><Icon name="calendarPlus" size={20} /></span>
            <div className="lc-mat-body">
              <h3 className="lc-mat-title">{t('materials.icsTitle')}</h3>
              <p className="lc-mat-desc">{t('materials.icsDesc')}</p>
              <button className="lc-btn sec" disabled={busy} onClick={() => icsRef.current?.click()}>{t('materials.icsUpload')}</button>
              <input ref={icsRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => void icsFile(e)} />
              {icsMsg && <p className="lc-sub">{icsMsg}</p>}
            </div>
          </article>
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t('materials.addOne')}>
        <label className="lc-field">
          <span className="lc-field-label">{t('materials.addTitle')}</span>
          <input className="lc-input" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder={t('materials.addTitlePh')} />
        </label>
        <label className="lc-field">
          <span className="lc-field-label">{t('materials.addBody')}</span>
          <textarea className="lc-input lc-textarea" rows={3} value={addBody} onChange={(e) => setAddBody(e.target.value)} />
        </label>
        <div className="lc-field">
          <span className="lc-field-label">{t('materials.addCategory')}</span>
          <div className="lc-chips">
            {enabledCats.map((c) => (
              <button key={c.id} className={'lc-chip' + (addCat === c.id ? ' on' : '')} onClick={() => setAddCat(c.id)}>{catName(c.id)}</button>
            ))}
          </div>
        </div>
        <div className="lc-sheet-actions">
          <button className="lc-btn sec" onClick={() => setAddOpen(false)}>{t('common.cancel')}</button>
          <button className="lc-btn pri" disabled={!addTitle.trim() || busy} onClick={() => void addOne()}>{t('common.save')}</button>
        </div>
      </Sheet>
      <Sheet open={!!icsCands} onClose={() => setIcsCands(null)} title={t('materials.icsPreview', { n: icsCands?.length ?? 0 })}>
        {icsWarnings.length > 0 && <p className="lc-sub">{t('materials.icsWarnings', { n: icsWarnings.length })}</p>}
        <ul className="lc-list">
          {(icsCands ?? []).slice(0, 20).map((c, i) => (
            <li key={i} className="lc-card">
              <div className="lc-cardmain"><span className="lc-cardtitle">{c.title}</span>{c.time && <span className="lc-time">{c.time}</span>}</div>
            </li>
          ))}
        </ul>
        <div className="lc-sheet-actions">
          <button className="lc-btn sec" onClick={() => setIcsCands(null)}>{t('common.cancel')}</button>
          <button className="lc-btn pri" disabled={!icsCands?.length} onClick={() => void confirmIcs()}>{t('materials.icsConfirm', { n: icsCands?.length ?? 0 })}</button>
        </div>
      </Sheet>
      <Sheet open={!!tzAsk} onClose={() => setTzAsk(null)} title={t('materials.tzTitle')}>
        <p className="lc-sub">{t('materials.tzAsk', { cal: tzAsk?.calendarTimezone ?? '', ses: tzAsk?.sessionTimezone ?? '', n: tzAsk?.events ?? 0 })}</p>
        <div className="lc-sheet-actions">
          <button className="lc-btn sec" onClick={() => setTzAsk(null)}>{t('common.cancel')}</button>
          <button className="lc-btn pri" onClick={() => void confirmTz()}>{t('materials.tzConfirm')}</button>
        </div>
      </Sheet>
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={t('materials.detailTitle')}>
        {detail && (
          <>
            <div className="lc-cardmain">
              <span className="lc-cardtitle">{detail.title}</span>
              <span className="lc-tag">{catName(detail.category)}</span>
            </div>
            {detail.body && <p className="lc-sub">{detail.body}</p>}
            {detail.summary && <p className="lc-sub">{detail.summary}</p>}
            <p className="lc-field-sub">{relWhen(detail.created_at, today, locale, t)}</p>
            <div className="lc-sheet-actions">
              <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.deleteMaterial(detail.id)).then(() => setDetail(null))}>{t('common.delete')}</button>
              <button className="lc-btn pri" onClick={() => setDetail(null)}>{t('common.save')}</button>
            </div>
          </>
        )}
      </Sheet>

      {notice && (
        <div className="lc-toast-wrap" aria-live="polite">
          <div className="lc-toast"><span>{notice}</span></div>
        </div>
      )}
    </div>
  );
}
