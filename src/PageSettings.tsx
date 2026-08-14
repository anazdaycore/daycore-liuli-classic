import { useCallback, useEffect, useState } from 'react';
import * as api from '@daycore/core';
import type { Boot, ChannelBinding, CustomTheme, MemoryFact, SessionPrefs, User } from '@daycore/core';
import { applyTheme as applyThemeVars } from './theme';

// 设置：这一份安装的所有旋钮。分组行结构 + 主题工作室，对齐原型 page-settings.jsx。

// ⚠️ Exported for the same reason as MATERIAL_TABS — see src/locales.test.ts.
export const CARE_SWITCHES: (keyof SessionPrefs)[] = [
  'morningBrief',
  'eveningReview',
  'deadlineAlerts',
  'rollingReplan',
  'gapSuggestions',
  'doNotDisturb',
  'autoPlan',
];

const CARE_ICONS: Record<string, string> = {
  morningBrief: '☀️',
  eveningReview: '🌙',
  deadlineAlerts: '🔔',
  rollingReplan: '🔄',
  gapSuggestions: '✨',
  doNotDisturb: '🙈',
  autoPlan: '⚡',
};

const BUILTIN_SWATCH: Record<string, [string, string, string]> = {
  sky: ['#38bdf8', '#e0f2fe', '#bae6fd'],
  sunset: ['#fb923c', '#ffedd5', '#fed7aa'],
  night: ['#a78bfa', '#1e1b4b', '#312e81'],
  nature: ['#4ade80', '#dcfce7', '#bbf7d0'],
};

function swatchFor(th: CustomTheme): { primary: string; start: string; end: string } {
  return {
    primary: th.variables['--primary'] || '#888',
    start: th.variables['--bg-start'] || '#eee',
    end: th.variables['--bg-end'] || '#ddd',
  };
}

export function PageSettings({ boot }: { boot: Boot }) {
  const t = boot.catalog.t;
  const [prefs, setPrefs] = useState<SessionPrefs | null>(null);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [themes, setThemes] = useState<CustomTheme[]>([]);
  const [builtin, setBuiltin] = useState<string[]>([]);
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [bindToken, setBindToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState(boot.session.assistantName ?? '');
  const [persona, setPersona] = useState('');
  const [activeTheme, setActiveTheme] = useState(boot.session.currentTheme ?? 'sky');
  const [themeDesc, setThemeDesc] = useState('');
  const [themeName, setThemeName] = useState('');
  const [generated, setGenerated] = useState<Record<string, string> | null>(null);
  const [newFact, setNewFact] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState(() => api.backendBase());

  const load = useCallback(async () => {
    try {
      const [p, m, th, ch, meRes] = await Promise.all([
        api.preferences(),
        api.memory(),
        api.themes(),
        api.channels(),
        api.me(),
      ]);
      setPrefs(p);
      setFacts(m.facts ?? []);
      setThemes(th.themes ?? []);
      setBuiltin(th.builtin ?? []);
      setBindings(ch.bindings ?? []);
      setUser(meRes.user);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

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

  function applyTheme(id: string) {
    void guard(async () => {
      await api.setTheme(id);
      applyThemeVars(id, themes);
      setActiveTheme(id);
    });
  }

  async function genTheme() {
    if (!themeDesc.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.generateTheme(themeDesc.trim());
      if (res.variables && Object.keys(res.variables).length > 0) {
        setGenerated(res.variables);
        setThemeName(themeDesc.trim().slice(0, 24));
      } else {
        setError(String(res.message ?? res.error ?? ''));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveGenerated() {
    if (!generated) return;
    setBusy(true);
    try {
      const th = await api.saveTheme({ name: themeName.trim() || 'custom', variables: generated });
      applyThemeVars(th.id, [th]);
      setActiveTheme(th.id);
      setGenerated(null);
      setThemeDesc('');
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function delTheme(id: string) {
    setBusy(true);
    try {
      await api.deleteTheme(id);
      if (activeTheme === id) {
        applyThemeVars('sky', []);
        setActiveTheme('sky');
      }
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const themeCards = (builtin ?? []).map((id) => {
    const sw = BUILTIN_SWATCH[id] ?? ['#888', '#eee', '#ddd'];
    return { id, name: t(`theme.${id}`), sw, custom: false };
  }).concat(themes.map((th) => {
    const sw = swatchFor(th);
    return { id: th.id, name: th.name, sw: [sw.primary, sw.start, sw.end] as [string, string, string], custom: true };
  }));

  return (
    <div className="lc-page">
      {error && <p className="lc-err">{error}</p>}

      {/* ── 助手 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.group.assistant')}</span>
        <div className="lc-stack">
          <div className="lc-set-row" style={{ cursor: 'default' }}>
            <span className="lc-set-ic" aria-hidden="true">❤️</span>
            <div className="lc-set-main">
              <div className="lc-set-title">{t('settings.assistant')}</div>
              <div className="lc-set-sub">{t('settings.assistantSub')}</div>
            </div>
            <input className="lc-input" style={{ maxWidth: 130 }} value={name} onChange={(e) => setName(e.target.value)}
              onBlur={() => { const v = name.trim(); if (v && v !== (boot.session.assistantName ?? '').trim()) void guard(() => api.patchSettings({ assistantName: v })); }}
              aria-label={t('settings.assistant')} />
          </div>
          <div className="lc-card">
            <div className="lc-set-title"><span aria-hidden="true">✨</span> {t('settings.persona')}</div>
            <p className="lc-set-sub">{t('settings.personaSub')}</p>
            <textarea className="lc-input lc-textarea" rows={4} maxLength={2000} placeholder={t('settings.personaPh')} value={persona}
              onChange={(e) => setPersona(e.target.value)}
              onBlur={() => { const v = persona.trim(); if (v) void guard(() => api.patchSettings({ personaPrompt: v })); }}
              aria-label={t('settings.persona')} />
          </div>
        </div>
      </section>

      {/* ── 语言 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.language')}</span>
        <div className="lc-set-row" style={{ cursor: 'default' }}>
          <span className="lc-set-ic" aria-hidden="true">🌐</span>
          <div className="lc-set-main">
            <div className="lc-set-title">{t('settings.language')}</div>
            <div className="lc-set-sub">{t('settings.languageSub')}</div>
          </div>
          <div className="lc-seg" style={{ flex: 'none', maxWidth: 180 }}>
            {boot.availableLocales.map((l) => (
              <button key={l} className={'lc-segitem' + (boot.catalog.locale === l ? ' on' : '')} onClick={() => { api.chooseLocale(l); location.reload(); }}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 主动关怀 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.care')}</span>
        <div className="lc-stack">
          {prefs && CARE_SWITCHES.map((k) => (
            <div key={String(k)} className="lc-set-row" style={{ cursor: 'default' }}>
              <span className="lc-set-ic" aria-hidden="true">{CARE_ICONS[String(k)]}</span>
              <div className="lc-set-main">
                <div className="lc-set-title">{t(`settings.pref.${String(k)}`)}</div>
              </div>
              <button className={'lc-switch' + (prefs[k] ? ' on' : '')} role="switch" aria-checked={Boolean(prefs[k])} disabled={busy}
                onClick={() => void guard(() => api.patchPreferences({ [k]: !prefs[k] }))} aria-label={t(`settings.pref.${String(k)}`)} />
            </div>
          ))}
        </div>
      </section>

      {/* ── 主题 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.theme')}</span>
        <div className="lc-theme-grid">
          {themeCards.map((c) => (
            <button key={c.id} className={'lc-theme-card' + (activeTheme === c.id ? ' on' : '')} onClick={() => applyTheme(c.id)}>
              <span className="lc-theme-swatch" style={{ background: 'linear-gradient(135deg, ' + c.sw[1] + ', ' + c.sw[2] + ')' }}>
                <span className="pill" style={{ background: c.sw[0] }} />
              </span>
              <span className="lc-theme-name">{c.name}</span>
              {activeTheme === c.id && <span className="lc-theme-check">✓</span>}
            </button>
          ))}
        </div>
        {themes.length > 0 && (
          <ul className="lc-list" style={{ marginTop: 10 }}>
            {themes.map((th) => (
              <li key={th.id} className="lc-row" style={{ padding: 0 }}>
                <button className={'lc-segitem' + (activeTheme === th.id ? ' on' : '')} style={{ flex: '0 0 auto' }} onClick={() => applyTheme(th.id)}>{th.name}</button>
                <button className="lc-btn sec" disabled={busy} onClick={() => void delTheme(th.id)}>{t('common.delete')}</button>
              </li>
            ))}
          </ul>
        )}
        <div className="lc-card" style={{ marginTop: 12 }}>
          <div className="lc-set-title"><span aria-hidden="true">🪄</span> {t('settings.themeGenerate')}</div>
          <input className="lc-input" placeholder={t('settings.themeGenPh')} value={themeDesc} onChange={(e) => setThemeDesc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void genTheme(); }} />
          {generated ? (
            <div className="lc-field" style={{ marginTop: 10 }}>
              <span className="lc-field-label">{t('settings.themeName')}</span>
              <input className="lc-input" value={themeName} onChange={(e) => setThemeName(e.target.value)} />
              <div className="lc-sheet-actions" style={{ marginTop: 10 }}>
                <button className="lc-btn sec" onClick={() => setGenerated(null)}>{t('common.cancel')}</button>
                <button className="lc-btn pri" disabled={busy} onClick={() => void saveGenerated()}>{t('settings.themeSave')}</button>
              </div>
            </div>
          ) : (
            <button className="lc-btn pri" disabled={busy || !themeDesc.trim()} onClick={() => void genTheme()}>{t('settings.themeGenerateBtn')}</button>
          )}
        </div>
        {boot.deferred.length > 0 && <p className="lc-sub" style={{ marginTop: 8 }}>{t('settings.deferred', { n: boot.deferred.length })}</p>}
      </section>

      {/* ── 记忆 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.memory')}</span>
        <ul className="lc-list">
          {facts.map((f) => (
            <li key={f.id} className="lc-set-row" style={{ cursor: 'default' }}>
              <span className="lc-set-ic" aria-hidden="true">🧠</span>
              <span className="lc-set-main"><span className="lc-set-title" style={{ fontSize: 14 }}>{f.fact}</span></span>
              <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.deleteMemory(f.id))}>{t('common.delete')}</button>
            </li>
          ))}
        </ul>
        <form className="lc-form" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const v = newFact.trim(); if (!v) return; setNewFact(''); void guard(() => api.addMemory(v)); }}>
          <input className="lc-input" value={newFact} onChange={(e) => setNewFact(e.target.value)} placeholder={t('settings.memoryAdd')} aria-label={t('settings.memoryAdd')} />
          <button className="lc-btn pri" type="submit">{t('common.save')}</button>
        </form>
        {facts.length > 0 && <button className="lc-btn sec" style={{ marginTop: 8 }} disabled={busy} onClick={() => void guard(() => api.clearMemory())}>{t('settings.memoryClear')}</button>}
      </section>

      {/* ── 通道 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.channels')}</span>
        {bindings.length === 0 ? (
          <p className="lc-sub">{t('settings.noChannel')}</p>
        ) : (
          <ul className="lc-list">
            {bindings.map((b) => (
              <li key={b.id} className="lc-set-row" style={{ cursor: 'default' }}>
                <span className="lc-set-ic" aria-hidden="true">💬</span>
                <span className="lc-set-main"><span className="lc-set-title">{b.channel}</span></span>
                <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.unbindChannel(b.channel))}>{t('settings.unbind')}</button>
              </li>
            ))}
          </ul>
        )}
        <button className="lc-btn sec" style={{ marginTop: 8 }} disabled={busy}
          onClick={() => void api.bindChannel('onebot').then((r) => setBindToken(r.token + ' — ' + r.note)).catch((e) => setError(e instanceof Error ? e.message : String(e)))}>
          {t('settings.bind')}
        </button>
        {bindToken && <p className="lc-sub" style={{ marginTop: 6 }}>{bindToken}</p>}
      </section>

      {/* ── 关于 ── */}
      <div className="lc-about-card">
        <p className="lc-sub" style={{ textAlign: 'center', fontWeight: 700 }}>{t('settings.version', { app: __APP_VERSION__, api: String(boot.handshake.version ?? '') })}</p>
        {boot.backendAhead && <p className="lc-sub">{t('settings.backendAhead')}</p>}
        <p className="lc-sub">{t('settings.console')}</p>
        {user && !user.isAnonymous && <p className="lc-sub">{user.name ?? user.email}</p>}
        <input className="lc-input" style={{ marginTop: 8 }} value={backend} onChange={(e) => setBackend(e.target.value)} placeholder={t('setting.sameOrigin')} aria-label={t('settings.backend')} />
        <button className="lc-btn sec" style={{ marginTop: 8 }} onClick={() => { api.setBackendBase(backend); location.reload(); }}>{t('common.save')}</button>
      </div>
    </div>
  );
}
