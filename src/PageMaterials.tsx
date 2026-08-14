import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '@daycore/core';
import type { Assignment, Boot, Course, Material, MaterialCategory, ScheduleRule } from '@daycore/core';
import { Icon } from './Icon';
import { dayDiff } from './days';
import { describeRule } from './rules';

// 资料：记下来的东西、还欠着的作业、数据源、每周都会发生的事。
// 对照原型 page-materials.jsx + materials-parts.jsx + capture-flow.jsx 加厚。

export const MATERIAL_TABS = ['notes', 'work', 'sources', 'rules'] as const;
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

export function PageMaterials({ boot }: { boot: Boot }) {
  const t = boot.catalog.t;
  const locale = boot.catalog.locale;
  const today = api.todayIso();
  const [tab, setTab] = useState<Tab>('notes');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [cats, setCats] = useState<MaterialCategory[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [work, setWork] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addBody, setAddBody] = useState('');
  const [addCat, setAddCat] = useState('note');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  const enabledCats = cats.filter((c) => c.enabled);
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? id;
  const feed = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return materials;
    return materials.filter((m) =>
      (m.title || '').toLowerCase().includes(ql) ||
      (m.body || '').toLowerCase().includes(ql) ||
      (m.summary || '').toLowerCase().includes(ql),
    );
  }, [materials, q]);

  return (
    <div className="lc-page">
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
                {c.name}{' ' + materials.filter((m) => m.category === c.id).length}
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
                    <article className="lc-card lc-matrow">
                      <span className="lc-cat-ic" style={c ? { background: 'color-mix(in srgb, var(--primary) 11%, transparent)' } : undefined}><Icon name={c ? catIcon(c) : 'notebookPen'} size={17} /></span>
                      <div className="lc-matrow-main">
                        <div className="lc-matrow-title">{m.title}</div>
                        {(m.body || m.summary) && <div className="lc-matrow-sum">{m.summary || m.body}</div>}
                        <div className="lc-matrow-meta">
                          <span className="cat">{catName(m.category)}</span>
                          {KNOWN_SOURCE.has(m.source) && m.source !== 'user' && <span>{t(`materials.source.${m.source}`)}</span>}
                          <span>{relWhen(m.created_at, today, locale, t)}</span>
                        </div>
                      </div>
                      <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.deleteMaterial(m.id))}>{t('common.delete')}</button>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {tab === 'work' && (
        <>
          {courses.length > 0 && (
            <div className="lc-chips">
              {courses.map((c) => (
                <span key={c.id} className="lc-chip">{c.courseCode || c.name}</span>
              ))}
            </div>
          )}
          {work.length === 0 ? (
            <Empty icon="bookOpen" title={t('materials.noWork')} />
          ) : (
            <ul className="lc-list">
              {work.map((a) => {
                const due = dueMeta(a, today, t);
                const done = a.status === 'done' || a.submitted;
                const course = courses.find((c) => c.id === a.courseId);
                return (
                  <li key={a.id}>
                    <article className={'lc-card' + (done ? ' done' : '')}>
                      <div className="lc-cardmain">
                        <span className="lc-cardtitle">{a.title}</span>
                      </div>
                      <div className="lc-matrow-meta">
                        {course?.courseCode && <span className="cat">{course.courseCode}</span>}
                        {due && <span className={'lc-due ' + due.cls}>{due.label}</span>}
                        {a.pointsPossible != null && <span>{t('materials.points', { n: a.pointsPossible })}</span>}
                        {a.status === 'planned' && <span>{t('materials.plannedHint')}</span>}
                      </div>
                      {!done && a.status !== 'dismissed' && (
                        <div className="lc-actrow">
                          <button className="lc-btn pri" disabled={busy} onClick={() => void guard(() => api.patchAssignment(a.id, { status: 'done' }))}>{t('materials.markDone')}</button>
                        </div>
                      )}
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
              <p className="lc-sub">{t('materials.importNote')}</p>
            </div>
          </article>
          <article className="lc-card lc-mat-card">
            <span className="lc-mat-ic"><Icon name="calendarPlus" size={20} /></span>
            <div className="lc-mat-body">
              <h3 className="lc-mat-title">{t('materials.icsTitle')}</h3>
              <p className="lc-mat-desc">{t('materials.icsDesc')}</p>
              <p className="lc-sub">{t('materials.importNote')}</p>
            </div>
          </article>
        </div>
      )}

      {tab === 'rules' && (
        <>
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
                      <p className="lc-sub">
                        {parts.map((p) => <span key={p.key} className="lc-part">{t(p.key, p.vars)}</span>)}
                      </p>
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
        </>
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
              <button key={c.id} className={'lc-chip' + (addCat === c.id ? ' on' : '')} onClick={() => setAddCat(c.id)}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="lc-sheet-actions">
          <button className="lc-btn sec" onClick={() => setAddOpen(false)}>{t('common.cancel')}</button>
          <button className="lc-btn pri" disabled={!addTitle.trim() || busy} onClick={() => void addOne()}>{t('common.save')}</button>
        </div>
      </Sheet>
    </div>
  );
}
