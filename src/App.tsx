import { useEffect, useRef, useState } from 'react';
import * as api from '@daycore/core';
import type { Boot } from '@daycore/core';
import { applyTheme } from './theme';
import { Icon } from './Icon';
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

  useEffect(() => {
    let live = true;
    void api
      .themes()
      .then((th) => {
        if (live) applyTheme(boot.session.currentTheme || 'sky', th.themes ?? []);
      })
      .catch(() => {
        if (live) applyTheme('sky', []);
      });
    return () => { live = false; };
  }, [boot.session.currentTheme]);

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

  return (
    <div className="lc-app">
      <aside className="lc-rail">
        <div className="lc-rail-logo"><span className="dot" aria-hidden="true" />{t('app.name')}</div>
        <nav className="lc-rail-nav" aria-label={t('nav.label')}>{navItems}</nav>
        <div className="lc-rail-user">
          <span className="lc-rail-user-avatar"><Icon name="user" size={18} /></span>
          <span className="lc-rail-user-meta">
            <span className="name">{boot.session.assistantName || t('app.name')}</span>
            <span className="sub">{t('app.subtitle')}</span>
          </span>
        </div>
      </aside>

      <header className={'lc-appbar' + (page === 'today' ? ' is-wide' : '')}>
        <div className="lc-appbar-title">
          {page === 'today' && <span className="lc-appbar-greet">{t(`greet.${greetSuffix(new Date().getHours())}`)}</span>}
          <span className="lc-appbar-main">{titles[page]}</span>
        </div>
        <button className="lc-qbtn" aria-label={t('app.account')} onClick={() => notify(t('app.accountSoon'))}>?</button>
      </header>

      <main className={'lc-main' + (page === 'today' ? ' is-wide' : '')}>
        {page === 'today' && <PageToday boot={boot} store={store} nav={nav} />}
        {page === 'materials' && <PageMaterials boot={boot} />}
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
    </div>
  );
}
