import { useEffect, useState, type ReactNode } from 'react';
import * as api from '@daycore/core';
import type { Boot, User } from '@daycore/core';
import { Icon } from './Icon';

// 账户 / 登录注册两个 sheet。对照原型 settings-theme.jsx 的 AuthSheet（去掉
// OAuth 行）+ AccountSheet，用本端 Sheet/lc-set-* 视觉件。
//
// ⚠️ 登录/注册成功后由后端种 dc_auth cookie，前端不碰 JWT；匿名会话自动 merge。

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

export function AuthSheet({ open, onClose, boot, onAuthed }: { open: boolean; onClose: () => void; boot: Boot; onAuthed: (u: User) => void }) {
  const t = boot.catalog.t;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setMode('login'); setName(''); setEmail(''); setPassword(''); setErr(''); } }, [open]);

  async function submit() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr(t('auth.badEmail')); return; }
    if (password.length < 8) { setErr(t('auth.badPassword')); return; }
    setBusy(true); setErr('');
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.register(email, password, name.trim() || undefined);
      onAuthed(res.user);
      onClose();
    } catch {
      setErr(t('auth.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'login' ? t('auth.signin') : t('auth.signup')}>
      {mode === 'register' && (
        <label className="lc-field">
          <span className="lc-field-label">{t('auth.name')}</span>
          <input className="lc-input" placeholder={t('auth.namePh')} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className="lc-field">
        <span className="lc-field-label">{t('auth.email')}</span>
        <input className="lc-input" type="email" placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="lc-field">
        <span className="lc-field-label">{t('auth.password')}</span>
        <input className="lc-input" type="password" placeholder={t('auth.passwordPh')} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
      </label>
      {err && <p className="lc-err">{err}</p>}
      <button className="lc-btn pri" disabled={busy} onClick={() => void submit()}>{mode === 'login' ? t('auth.signin') : t('auth.createAccount')}</button>
      <button className="lc-link lc-center" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>{mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}</button>
    </Sheet>
  );
}

export function AccountSheet({ open, onClose, boot, user, onOpenAuth, onLogout }: { open: boolean; onClose: () => void; boot: Boot; user: User | null; onOpenAuth: () => void; onLogout: () => void }) {
  const t = boot.catalog.t;
  return (
    <Sheet open={open} onClose={onClose} title={t('auth.account')}>
      <div className="lc-account-head">
        <span className="lc-account-avatar">{user?.name?.[0] ?? '?'}</span>
        <div className="lc-account-meta">
          <div className="lc-account-name">{user?.name ?? t('auth.anon')}</div>
          <div className="lc-sub">{user ? (user.email ? user.email + ' · ' + t('auth.synced') : t('auth.synced')) : t('auth.anonSub')}</div>
        </div>
      </div>
      {user ? (
        <button className="lc-btn sec lc-full withicon" onClick={onLogout}><Icon name="logout" size={16} /> {t('auth.signout')}</button>
      ) : (
        <button className="lc-btn pri lc-full" onClick={onOpenAuth}>{t('auth.signin')} / {t('auth.signup')}</button>
      )}
    </Sheet>
  );
}
