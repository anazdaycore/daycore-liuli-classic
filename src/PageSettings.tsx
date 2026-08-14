import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as api from '@daycore/core';
import type { Boot, ChannelBinding, CustomTheme, MemoryFact, SessionPrefs, User } from '@daycore/core';
import { applyTheme as applyThemeVars, applyThemeObject } from './theme';
import { Icon } from './Icon';

// 设置：这一份安装的所有旋钮。分组行结构 + 主题工作室（预览条 + 右键/长按菜单），
// 对齐原型 page-settings.jsx + settings-theme.jsx。

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
  morningBrief: 'sun',
  eveningReview: 'moon',
  deadlineAlerts: 'bell',
  rollingReplan: 'refreshCw',
  gapSuggestions: 'sparkles',
  doNotDisturb: 'eyeOff',
  autoPlan: 'zap',
};

const BUILTIN_SWATCH: Record<string, [string, string, string]> = {
  sky: ['#38bdf8', '#e0f2fe', '#bae6fd'],
  sunset: ['#fb923c', '#ffedd5', '#fed7aa'],
  night: ['#a78bfa', '#1e1b4b', '#312e81'],
  nature: ['#4ade80', '#dcfce7', '#bbf7d0'],
};

interface ChannelInfo { name: string; label: string; available: boolean; }

function swatchFor(th: CustomTheme): { primary: string; start: string; end: string } {
  return {
    primary: th.variables['--primary'] || '#888',
    start: th.variables['--bg-start'] || '#eee',
    end: th.variables['--bg-end'] || '#ddd',
  };
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

export function PageSettings({ boot }: { boot: Boot }) {
  const t = boot.catalog.t;
  const [prefs, setPrefs] = useState<SessionPrefs | null>(null);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [themes, setThemes] = useState<CustomTheme[]>([]);
  const [builtin, setBuiltin] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [bindToken, setBindToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState(boot.session.assistantName ?? '');
  const [persona, setPersona] = useState(boot.session.personaPrompt ?? '');
  const [activeTheme, setActiveTheme] = useState(boot.session.currentTheme ?? 'sky');
  const [themeDesc, setThemeDesc] = useState('');
  const [aiBase, setAiBase] = useState('');
  const [preview, setPreview] = useState<{ variables: Record<string, string>; name: string; editingId: string | null } | null>(null);
  const [menu, setMenu] = useState<{ theme: CustomTheme; x: number; y: number } | null>(null);
  const [rename, setRename] = useState<CustomTheme | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [tweaking, setTweaking] = useState<CustomTheme | null>(null);
  const [tweakDesc, setTweakDesc] = useState('');
  const [newFact, setNewFact] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState(() => api.backendBase());
  const longPress = useRef<number | null>(null);

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
      setChannels(ch.channels ?? []);
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

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);

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

  async function genTheme(editingId: string | null = null, desc = themeDesc) {
    const d = desc.trim();
    if (!d) return;
    setBusy(true);
    setError('');
    try {
      // ⚠️ 起手有两种：纯新（带 base）或「AI 改一版」（带 themeId 起手）。
      const res = editingId
        ? await api.generateTheme({ description: d, themeId: editingId })
        : await api.generateTheme({ description: d, base: aiBase || undefined });
      if (res.variables && Object.keys(res.variables).length > 0) {
        const name = d.slice(0, 24);
        setPreview({ variables: res.variables, name, editingId });
        // 预览底座：AI 改一版沿用被改主题的 dark/base；纯新用所选 base（无 → sky）。
        const source = editingId ? themes.find((th) => th.id === editingId) : null;
        applyThemeObject({ dark: source?.dark ?? false, base: source?.base ?? aiBase, variables: res.variables });
      } else {
        setError(String(res.message ?? res.error ?? ''));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    applyThemeVars(activeTheme, themes);
  }

  async function savePreview() {
    if (!preview) return;
    setBusy(true);
    try {
      if (preview.editingId) {
        // AI 改一版：把生成结果写回原主题（patchTheme 不收 base，底座不变）。
        await api.patchTheme(preview.editingId, { variables: preview.variables });
        applyThemeVars(preview.editingId, themes);
        setActiveTheme(preview.editingId);
      } else {
        const th = await api.saveTheme({ name: preview.name || 'custom', base: aiBase || undefined, variables: preview.variables });
        applyThemeVars(th.id, [th]);
        setActiveTheme(th.id);
      }
      setPreview(null);
      setThemeDesc('');
      setTweaking(null);
      setTweakDesc('');
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

  async function saveRename() {
    if (!rename || !renameVal.trim()) return;
    setBusy(true);
    try {
      await api.patchTheme(rename.id, { name: renameVal.trim() });
      setRename(null);
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function bind(channel: string) {
    setBusy(true);
    try {
      const r = await api.bindChannel(channel);
      setBindToken(r.token + ' — ' + r.note);
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openMenu(e: { clientX: number; clientY: number; preventDefault?: () => void }, th: CustomTheme) {
    e.preventDefault?.();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 130);
    setMenu({ theme: th, x, y });
  }

  const themeCards = (builtin ?? []).map((id) => {
    const sw = BUILTIN_SWATCH[id] ?? ['#888', '#eee', '#ddd'];
    return { id, name: t(`theme.${id}`), sw, theme: null as CustomTheme | null };
  }).concat(themes.map((th) => {
    const sw = swatchFor(th);
    return { id: th.id, name: th.name, sw: [sw.primary, sw.start, sw.end] as [string, string, string], theme: th };
  }));

  return (
    <div className="lc-page">
      {error && <p className="lc-err">{error}</p>}

      {/* ── 助手 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.group.assistant')}</span>
        <div className="lc-stack">
          <div className="lc-set-row" style={{ cursor: 'default' }}>
            <span className="lc-set-ic"><Icon name="heart" size={18} /></span>
            <div className="lc-set-main">
              <div className="lc-set-title">{t('settings.assistant')}</div>
              <div className="lc-set-sub">{t('settings.assistantSub')}</div>
            </div>
            <input className="lc-input" style={{ maxWidth: 130 }} value={name} onChange={(e) => setName(e.target.value)}
              onBlur={() => { const v = name.trim(); if (v && v !== (boot.session.assistantName ?? '').trim()) void guard(() => api.patchSettings({ assistantName: v })); }}
              aria-label={t('settings.assistant')} />
          </div>
          <div className="lc-card">
            <div className="lc-set-title lc-row8"><Icon name="sparkles" size={15} /> {t('settings.persona')}</div>
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
          <span className="lc-set-ic"><Icon name="globe" size={18} /></span>
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
              <span className="lc-set-ic"><Icon name={CARE_ICONS[String(k)] ?? 'sparkles'} size={18} /></span>
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
            <button key={c.id} className={'lc-theme-card' + (activeTheme === c.id ? ' on' : '')} onClick={() => applyTheme(c.id)}
              onContextMenu={c.theme ? (e) => openMenu(e, c.theme!) : undefined}
              onTouchStart={c.theme ? (e) => { const t0 = e.touches[0]; if (!t0) return; longPress.current = window.setTimeout(() => openMenu({ clientX: t0.clientX, clientY: t0.clientY }, c.theme!), 550); } : undefined}
              onTouchEnd={() => { if (longPress.current) clearTimeout(longPress.current); }}
              onTouchMove={() => { if (longPress.current) clearTimeout(longPress.current); }}>
              <span className="lc-theme-swatch" style={{ background: 'linear-gradient(135deg, ' + c.sw[1] + ', ' + c.sw[2] + ')' }}>
                <span className="pill" style={{ background: c.sw[0] }} />
              </span>
              <span className="lc-theme-name">{c.name}</span>
              {activeTheme === c.id && <span className="lc-theme-check"><Icon name="check" size={13} /></span>}
            </button>
          ))}
        </div>
        {themes.length > 0 && <p className="lc-field-sub" style={{ marginTop: 8 }}>{t('settings.themeHintMenu')}</p>}
        <div className="lc-card" style={{ marginTop: 12 }}>
          <div className="lc-set-title lc-row8"><Icon name="wand" size={15} /> {t('settings.themeGenerate')}</div>
          <input className="lc-input" placeholder={t('settings.themeGenPh')} value={themeDesc} onChange={(e) => setThemeDesc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void genTheme(); }} />
          <div className="lc-chips">
            <span className="lc-field-sub">{t('settings.aiBase')}</span>
            <button className={'lc-chip' + (aiBase === '' ? ' on' : '')} onClick={() => setAiBase('')}>{t('settings.aiBaseNone')}</button>
            {builtin.map((b) => (
              <button key={b} className={'lc-chip' + (aiBase === b ? ' on' : '')} onClick={() => setAiBase(b)}>{t(`theme.${b}`)}</button>
            ))}
          </div>
          <button className="lc-btn pri" disabled={busy || !themeDesc.trim()} onClick={() => void genTheme()}>{t('settings.themeGenerateBtn')}</button>
        </div>
        {boot.deferred.length > 0 && <p className="lc-sub" style={{ marginTop: 8 }}>{t('settings.deferred', { n: boot.deferred.length })}</p>}
      </section>

      {/* ── 记忆 ── */}
      <section className="lc-set-group">
        <span className="lc-label">{t('settings.memory')}</span>
        <ul className="lc-list">
          {facts.map((f) => (
            <li key={f.id} className="lc-set-row" style={{ cursor: 'default' }}>
              <span className="lc-set-ic"><Icon name="brain" size={18} /></span>
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
        {channels.length === 0 ? (
          <p className="lc-sub">{t('settings.noChannel')}</p>
        ) : (
          <div className="lc-stack">
            {channels.map((ch) => {
              const bound = bindings.find((b) => b.channel === ch.name);
              return (
                <div key={ch.name} className="lc-set-row" style={{ cursor: 'default' }}>
                  <span className="lc-set-ic"><Icon name="messageCircle" size={18} /></span>
                  <div className="lc-set-main">
                    <div className="lc-set-title">{ch.label}</div>
                    <div className="lc-set-sub">{bound ? (bound.externalId || t('settings.channelBound')) : t('settings.channelUnbound')}</div>
                  </div>
                  {bound ? (
                    <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.unbindChannel(ch.name))}>{t('settings.unbind')}</button>
                  ) : (
                    <button className="lc-btn sec" disabled={busy || !ch.available} onClick={() => void bind(ch.name)}>{t('settings.bind')}</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {bindToken && <div className="lc-card" style={{ marginTop: 10 }}><p className="lc-sub" style={{ wordBreak: 'break-all' }}>{bindToken}</p></div>}
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

      {/* 预览条 + 上下文菜单 + 重命名 */}
      {preview && (
        <div className="lc-preview-bar">
          <Icon name="palette" size={18} />
          <span className="lc-preview-name">{preview.name}</span>
          <button className="lc-preview-btn" onClick={cancelPreview}>{t('common.cancel')}</button>
          <button className="lc-preview-btn primary" disabled={busy} onClick={() => void savePreview()}>{t('settings.themeSave')}</button>
        </div>
      )}
      {menu && (
        <div className="lc-ctx-menu" style={{ left: menu.x, top: menu.y }}>
          <button className="lc-ctx-item" onClick={() => { setRename(menu.theme); setRenameVal(menu.theme.name); setMenu(null); }}>
            <Icon name="pencil" size={15} /> {t('settings.themeRename')}
          </button>
          <button className="lc-ctx-item" onClick={() => { setTweaking(menu.theme); setTweakDesc(''); setMenu(null); }}>
            <Icon name="wand" size={15} /> {t('settings.themeAiTweak')}
          </button>
          <button className="lc-ctx-item danger" onClick={() => { const th = menu.theme; setMenu(null); void delTheme(th.id); }}>
            <Icon name="trash" size={15} /> {t('common.delete')}
          </button>
        </div>
      )}
      <Sheet open={!!rename} onClose={() => setRename(null)} title={t('settings.themeRename')}>
        <input className="lc-input" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} />
        <div className="lc-sheet-actions">
          <button className="lc-btn sec" onClick={() => setRename(null)}>{t('common.cancel')}</button>
          <button className="lc-btn pri" disabled={!renameVal.trim() || busy} onClick={() => void saveRename()}>{t('common.save')}</button>
        </div>
      </Sheet>
      <Sheet open={!!tweaking} onClose={() => setTweaking(null)} title={t('settings.themeAiTweak')}>
        <p className="lc-sub">{tweaking ? tweaking.name : ''}</p>
        <input className="lc-input" placeholder={t('settings.themeGenPh')} value={tweakDesc} onChange={(e) => setTweakDesc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void genTheme(tweaking!.id, tweakDesc); }} />
        <div className="lc-sheet-actions">
          <button className="lc-btn sec" onClick={() => setTweaking(null)}>{t('common.cancel')}</button>
          <button className="lc-btn pri" disabled={!tweakDesc.trim() || busy} onClick={() => tweaking && void genTheme(tweaking.id, tweakDesc)}>{t('settings.themeGenerateBtn')}</button>
        </div>
      </Sheet>
    </div>
  );
}
