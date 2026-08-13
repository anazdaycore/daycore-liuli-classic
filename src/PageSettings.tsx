import { useCallback, useEffect, useState } from 'react';
import * as api from '@daycore/core';
import type { Boot, ChannelBinding, CustomTheme, MemoryFact, SessionPrefs, User } from '@daycore/core';
import { applyTheme as applyThemeVars } from './theme';

// 设置：这一份安装的所有旋钮。
//
// 页面制's settings page is a long scroll rather than a drawer, which is the
// paradigm being consistent with itself: everything is out in the open, named,
// and reachable in one place.

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
      // ⚠️ builtin 是纯 id 列表（后端 domain.BuiltinThemes = []string{…}），
      // 不是带 name 的对象 —— 直接存下来即可。
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
      // ⚠️ 自定义主题没有对应的 CSS 规则：id 无选择器，光 setAttribute 等于没
      // 换。内置走属性选择器；自定义以底座（dark?'night':base||'sky'）为底，
      // variables 逐条写进 :root。切回内置时 applyThemeVars 会先清掉旧的 inline。
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
      // 后端会把「正用着的主题」重置为默认 sky，这里同步回退而不是继续指着
      // 一个刚删掉的 id。
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

  return (
    <div className="lc-page">
      <header className="lc-head">
        <h1 className="lc-title">{t('nav.settings')}</h1>
      </header>
      {error && <p className="lc-err">{error}</p>}

      {/* ── 助手 ── */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.assistant')}</h2>
        <input
          className="lc-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          // ⚠️ Compare the TRIMMED draft against the stored value. The prototype
          // compared the raw draft and stored the trimmed one, so a trailing
          // space made every blur fire a request and every check say "changed".
          onBlur={() => {
            const v = name.trim();
            if (v && v !== (boot.session.assistantName ?? '').trim()) {
              void guard(() => api.patchSettings({ assistantName: v }));
            }
          }}
          aria-label={t('settings.assistant')}
        />
      </section>

      {/* ── 对助手的嘱咐（L2 提示词）──
          ⚠️ 后端 Session.PersonaPrompt 是 json:"-"，没有读接口：这里只能写、
          读不回来，所以失焦即存，但下次进来看不到上一次写的内容。这是个已知缺口。 */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.persona')}</h2>
        <p className="lc-sub">{t('settings.personaSub')}</p>
        <textarea
          className="lc-input lc-textarea"
          rows={4}
          maxLength={2000}
          placeholder={t('settings.personaPh')}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          onBlur={() => {
            const v = persona.trim();
            if (v) void guard(() => api.patchSettings({ personaPrompt: v }));
          }}
          aria-label={t('settings.persona')}
        />
      </section>

      {/* ── 语言 ── */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.language')}</h2>
        {/* ⚠️ The list comes from the handshake — every language this
            INSTALLATION can render — not from a pair of buttons written here.
            An operator who drops a file into LOCALES_DIR adds a language, and a
            hardcoded pair would simply never offer it. */}
        <div className="lc-seg">
          {boot.availableLocales.map((l) => (
            <button
              key={l}
              className={'lc-segitem' + (boot.catalog.locale === l ? ' on' : '')}
              onClick={() => {
                api.chooseLocale(l);
                location.reload();
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      {/* ── 主动关怀 ── */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.care')}</h2>
        {prefs &&
          CARE_SWITCHES.map((k) => (
            <label key={String(k)} className="lc-row">
              <input
                type="checkbox"
                checked={Boolean(prefs[k])}
                disabled={busy}
                onChange={(e) => void guard(() => api.patchPreferences({ [k]: e.target.checked }))}
              />
              <span>{t(`settings.pref.${String(k)}`)}</span>
            </label>
          ))}
      </section>

      {/* ── 主题 ── */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.theme')}</h2>
        <div className="lc-seg">
          {builtin.map((id) => (
            <button key={id} className={'lc-segitem' + (activeTheme === id ? ' on' : '')} onClick={() => applyTheme(id)}>
              {t(`theme.${id}`)}
            </button>
          ))}
        </div>
        {themes.length > 0 && (
          <ul className="lc-list">
            {themes.map((th) => (
              <li key={th.id} className="lc-row">
                <button
                  className={'lc-segitem' + (activeTheme === th.id ? ' on' : '')}
                  onClick={() => applyTheme(th.id)}
                >
                  {th.name}
                </button>
                <button className="lc-btn sec" disabled={busy} onClick={() => void delTheme(th.id)}>
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* ── 主题工作室：AI 生成 → 保存 ── */}
        <div className="lc-field">
          <span className="lc-field-label">{t('settings.themeGenerate')}</span>
          <textarea
            className="lc-input lc-textarea"
            rows={2}
            placeholder={t('settings.themeGenPh')}
            value={themeDesc}
            onChange={(e) => setThemeDesc(e.target.value)}
          />
        </div>
        {generated ? (
          <div className="lc-field">
            <span className="lc-field-label">{t('settings.themeName')}</span>
            <input className="lc-input" value={themeName} onChange={(e) => setThemeName(e.target.value)} />
            <div className="lc-sheet-actions">
              <button className="lc-btn sec" onClick={() => setGenerated(null)}>{t('common.cancel')}</button>
              <button className="lc-btn pri" disabled={busy} onClick={() => void saveGenerated()}>{t('settings.themeSave')}</button>
            </div>
          </div>
        ) : (
          <button className="lc-btn sec" disabled={busy || !themeDesc.trim()} onClick={() => void genTheme()}>
            {t('settings.themeGenerateBtn')}
          </button>
        )}
        {boot.deferred.length > 0 && (
          // Not an error and not silent: an operator has to approve a kind
          // before those tokens can be themed. 初版 proposes none, so this is
          // reachable only if an operator moved this build into another family.
          <p className="lc-sub">{t('settings.deferred', { n: boot.deferred.length })}</p>
        )}
      </section>

      {/* ── 记忆 ── */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.memory')}</h2>
        <ul className="lc-list">
          {facts.map((f) => (
            <li key={f.id} className="lc-row">
              <span>{f.fact}</span>
              <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.deleteMemory(f.id))}>
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="lc-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = newFact.trim();
            if (!v) return;
            setNewFact('');
            void guard(() => api.addMemory(v));
          }}
        >
          <input
            className="lc-input"
            value={newFact}
            onChange={(e) => setNewFact(e.target.value)}
            placeholder={t('settings.memoryAdd')}
            aria-label={t('settings.memoryAdd')}
          />
          <button className="lc-btn pri" type="submit">
            {t('common.save')}
          </button>
        </form>
        {facts.length > 0 && (
          <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.clearMemory())}>
            {t('settings.memoryClear')}
          </button>
        )}
      </section>

      {/* ── 消息通道 ── */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.channels')}</h2>
        {bindings.length === 0 ? (
          <p className="lc-sub">{t('settings.noChannel')}</p>
        ) : (
          <ul className="lc-list">
            {bindings.map((b) => (
              <li key={b.id} className="lc-row">
                <span>{b.channel}</span>
                <button className="lc-btn sec" disabled={busy} onClick={() => void guard(() => api.unbindChannel(b.channel))}>
                  {t('settings.unbind')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          className="lc-btn sec"
          disabled={busy}
          onClick={() =>
            void api
              .bindChannel('onebot')
              .then((r) => setBindToken(r.token + ' — ' + r.note))
              .catch((e) => setError(e instanceof Error ? e.message : String(e)))
          }
        >
          {t('settings.bind')}
        </button>
        {/* ⚠️ Poll the LISTING to learn whether it worked.
            POST /api/channels/{c}/verify is the BOT's endpoint — an
            unauthenticated, rate-limited one — so calling it from here is
            sending yourself your own confirmation. */}
        {bindToken && <p className="lc-sub">{bindToken}</p>}
      </section>

      {/* ── 这份安装 ── */}
      <section className="lc-card">
        <h2 className="lc-cardtitle">{t('settings.backend')}</h2>
        <input
          className="lc-input"
          value={backend}
          onChange={(e) => setBackend(e.target.value)}
          placeholder={t('setting.sameOrigin')}
          aria-label={t('settings.backend')}
        />
        <div className="lc-actrow">
          <button
            className="lc-btn sec"
            onClick={() => {
              api.setBackendBase(backend);
              location.reload();
            }}
          >
            {t('common.save')}
          </button>
        </div>
        <p className="lc-sub">
          {t('settings.version', { app: __APP_VERSION__, api: String(boot.handshake.version ?? '') })}
        </p>
        {/* ⚠️ Said out loud, somewhere calm, rather than left in a field nobody
            reads. The backend serves a newer contract than this build speaks; it
            still serves ours, so everything works — but "works" and "is current"
            are different claims, and the second one going quietly false is the
            failure this flag exists to surface. */}
        {boot.backendAhead && <p className="lc-sub">{t('settings.backendAhead')}</p>}
        {/* ⚠️ Shown unconditionally, and that is the honest choice rather than
            the lazy one. GET /api/me carries `isOwner`, so a conditional is
            possible — but roles are NOT in that shape, so it would be right for
            owners and wrong for every role-based administrator, hiding the door
            from exactly the people who were granted a key. The console is a
            separate deployment with its own login; the link costs nothing and
            the sentence says who can walk through it. */}
        <p className="lc-sub">{t('settings.console')}</p>
        {user && !user.isAnonymous && <p className="lc-sub">{user.name ?? user.email}</p>}
      </section>
    </div>
  );
}
