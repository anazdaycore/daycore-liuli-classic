import { useEffect, useRef, useState } from 'react';
import * as api from '@daycore/core';
import { FAMILY_ID } from './manifest';
import type { Boot, User } from '@daycore/core';
import { applyTheme } from './theme';
import { Icon } from './Icon';
import { AccountSheet, AuthSheet } from './AuthSheets';
import { useStore } from './store';
import { PageToday } from './PageToday';
import { PageMaterials } from './PageMaterials';
import { PageCompanion } from './PageCompanion';
import { PageMood } from './PageMood';
import { PageSettings } from './PageSettings';

// 五个页面，一条一直在屏幕上的导航栏。
export type PageId = 'today' | 'materials' | 'companion' | 'mood' | 'settings';
export const PAGES: PageId[] = ['today', 'materials', 'companion', 'mood', 'settings'];

/** 跨页导航：动作卡「查看规则/记忆/计划」与块卡「编辑规则」都要带着意图跳页。 */
export interface Nav {
  go: (page: PageId, params?: Record<string, string>) => void;
  params: Record<string, string>;
}

function greetSuffix(h: number): string {
  if (h < 5) return 'night';
  if (h < 11) return 'morning';
  if (h < 13) return 'noon';
  if (h < 18) return 'afternoon';
  if (h < 23) return 'evening';
  return 'night';
}

// 原型 DcIcons 的 24px 描边图标（design-ui/icons.js），导航与账户位。
const ICONS: Record<PageId, string> = {
  today: 'sun',
  materials: 'layers',
  companion: 'chat',
  mood: 'smile',
  settings: 'settings',
};

export function App({ boot }: { boot: Boot }) {
  const t = boot.catalog.t;
  const store = useStore(boot);
  const [page, setPage] = useState<PageId>('today');
  const [navParams, setNavParams] = useState<Record<string, string>>({});
  const [user, setUser] = useState<User | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const go: Nav['go'] = (next, params) => {
    setNavParams(params ?? {});
    setPage(next);
    window.scrollTo(0, 0);
  };
  const nav: Nav = { go, params: navParams };

  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | null>(null);
  const notify = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // 账户：boot 时 me() 定登录态；登录/登出后往 sessionStorage 写提示，reload 后这次 boot 弹出。
  useEffect(() => {
    let live = true;
    void api.me().then((r) => { if (live) setUser(r.user); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const msg = sessionStorage.getItem('dc-auth-toast');
    if (msg) {
      sessionStorage.removeItem('dc-auth-toast');
      notify(msg);
    }
  }, []);

  useEffect(() => {
    let live = true;
    void api
      .themes()
      .then((th) => {
        if (live) applyTheme(api.themeForFamily(boot.session, FAMILY_ID) || 'sky', th.themes ?? []);
      })
      .catch(() => {
        if (live) applyTheme('sky', []);
      });
    return () => { live = false; };
  }, [boot.session.currentTheme, boot.session.preferences]);

  const badges: Partial<Record<PageId, number>> = { today: store.proposals.length };

  const titles: Record<PageId, string> = {
    today: t('app.name'),
    materials: t('nav.materials'),
    companion: boot.session.assistantName || t('nav.companion'),
    mood: t('nav.mood'),
    settings: t('nav.settings'),
  };

  const navItems = PAGES.map((id) => {
    const n = badges[id] ?? 0;
    return (
      <button
        key={id}
        className={'lc-navitem' + (page === id ? ' on' : '')}
        aria-current={page === id ? 'page' : undefined}
        onClick={() => go(id)}
      >
        <span className="lc-navicon"><Icon name={ICONS[id]} size={22} /></span>
        <span className="lc-navlabel">{t(`nav.${id}`)}</span>
        {n > 0 && (
          <span className="lc-badge" aria-label={t('nav.waiting', { n })}>{n > 9 ? '9+' : n}</span>
        )}
      </button>
    );
  });

  const authed = (u: User) => {
    setUser(u);
    sessionStorage.setItem('dc-auth-toast', t('auth.welcome', { name: u.name ?? '' }));
    location.reload();
  };
  const signOut = () => {
    void api.logout().then(() => {
      sessionStorage.setItem('dc-auth-toast', t('auth.signedOut'));
      location.reload();
    }).catch(() => {});
  };

  return (
    <div className="lc-app">
      <aside className="lc-rail">
        <div className="lc-rail-logo"><span className="dot" aria-hidden="true" />{t('app.name')}</div>
        <nav className="lc-rail-nav" aria-label={t('nav.label')}>{navItems}</nav>
        <button className="lc-rail-user" onClick={() => setAccountOpen(true)}>
          <span className="lc-rail-user-avatar">{user?.name?.[0] ?? <Icon name="user" size={18} />}</span>
          <span className="lc-rail-user-meta">
            <span className="name">{user?.name ?? boot.session.assistantName ?? t('app.name')}</span>
            <span className="sub">{user ? t('auth.synced') : t('app.subtitle')}</span>
          </span>
        </button>
      </aside>

      <header className={'lc-appbar' + (page === 'today' ? ' is-wide' : '')}>
        <div className="lc-appbar-title">
          {page === 'today' && <span className="lc-appbar-greet">{t(`greet.${greetSuffix(new Date().getHours())}`)}</span>}
          <span className="lc-appbar-main">{titles[page]}</span>
        </div>
        <button className="lc-qbtn" aria-label={t('app.account')} onClick={() => setAccountOpen(true)}>?</button>
      </header>

      <main className={'lc-main' + (page === 'today' ? ' is-wide' : '')}>
        {page === 'today' && <PageToday boot={boot} store={store} nav={nav} />}
        {page === 'materials' && <PageMaterials boot={boot} nav={nav} />}
        {page === 'companion' && <PageCompanion boot={boot} nav={nav} />}
        {page === 'mood' && <PageMood boot={boot} />}
        {page === 'settings' && <PageSettings boot={boot} />}
      </main>

      <div className="lc-tabbar-wrap">
        <nav className="lc-tabs" aria-label={t('nav.label')}>{navItems}</nav>
      </div>

      <div className="lc-undowrap">
        {store.undo && (
          <div className="lc-undo" role="status">
            <span>{store.undo.label}</span>
            <button className="lc-btn sec" onClick={() => void store.takeBack()}>{t('undo.takeBack')}</button>
          </div>
        )}
      </div>

      {toast && (
        <div className="lc-toast-wrap" aria-live="polite">
          <div className="lc-toast"><span>{toast}</span></div>
        </div>
      )}

      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        boot={boot}
        user={user}
        onOpenAuth={() => { setAccountOpen(false); setAuthOpen(true); }}
        onLogout={signOut}
      />
      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        boot={boot}
        onAuthed={authed}
      />
    </div>
  );
}
