import { useCallback, useEffect, useState } from 'react';
import * as api from '@daycore/core';
import type { Boot, MoodCheckin } from '@daycore/core';

// 心情：12 格心情砖 + 可选便签 + 最近打卡。对齐原型 page-mood.jsx。
//
// ⚠️ 后端 moodKinds() 是另一套命名（happy/calm/loved/…/sleepless），这里用原型
// 定稿的 12 个（很好/平静/…/不舒服）做 UI，再确定性映射回后端的 id —— 不显示
// 后端那套「开心/被爱/失眠」的自造名。

const MOODS: { key: string; emoji: string; id: string }[] = [
  { key: 'mood.great', emoji: '😊', id: 'happy' },
  { key: 'mood.calm', emoji: '😌', id: 'calm' },
  { key: 'mood.excited', emoji: '🤩', id: 'excited' },
  { key: 'mood.grateful', emoji: '🥰', id: 'loved' },
  { key: 'mood.tired', emoji: '😪', id: 'tired' },
  { key: 'mood.stressed', emoji: '😣', id: 'stressed' },
  { key: 'mood.anxious', emoji: '😰', id: 'anxious' },
  { key: 'mood.sad', emoji: '😢', id: 'down' },
  { key: 'mood.angry', emoji: '😠', id: 'irritable' },
  { key: 'mood.bored', emoji: '😑', id: 'neutral' },
  { key: 'mood.lonely', emoji: '🫥', id: 'sleepless' },
  { key: 'mood.sick', emoji: '🤒', id: 'unwell' },
];

const MOOD_META: Record<string, { emoji: string; key: string }> = Object.fromEntries(
  MOODS.map((m) => [m.id, { emoji: m.emoji, key: m.key }]),
);

function relWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function PageMood({ boot }: { boot: Boot }) {
  const t = boot.catalog.t;
  const locale = boot.catalog.locale;
  const [history, setHistory] = useState<MoodCheckin[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const h = await api.moodHistory(6);
      setHistory(h ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const m = MOODS.find((x) => x.key === picked);
    if (!m || busy) return;
    const text = note.trim();
    setBusy(true);
    setReply('');
    try {
      await api.recordMood(m.id, text);
      const r = await api.askMoodReply(m.id, text);
      setReply(r.response);
      setNote('');
      setPicked(null);
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
      <div className="lc-sechead">
        <h1 className="lc-sechead-title">{t('mood.title')}</h1>
        <p className="lc-sechead-sub">{t('mood.subtitle')}</p>
      </div>
      {error && <p className="lc-err">{error}</p>}

      <div className="lc-moods">
        {MOODS.map((m) => (
          <button key={m.key} className={'lc-mood' + (picked === m.key ? ' on' : '')} disabled={busy} onClick={() => { setPicked(picked === m.key ? null : m.key); setReply(''); }}>
            <span className="lc-moodemoji" aria-hidden="true">{m.emoji}</span>
            <span className="lc-moodname">{t(m.key)}</span>
          </button>
        ))}
      </div>

      {picked && (
        <div className="lc-card">
          <textarea className="lc-input lc-textarea" rows={2} maxLength={200} placeholder={t('mood.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="lc-actrow" style={{ justifyContent: 'flex-end' }}>
            <button className="lc-btn pri" disabled={busy} onClick={() => void submit()}>{t('mood.record')}</button>
          </div>
        </div>
      )}

      {reply && (
        <article className="lc-card">
          <p>{reply}</p>
        </article>
      )}

      {history.length > 0 && (
        <>
          <h2 className="lc-groupsep">{t('mood.history')}</h2>
          <ul className="lc-list">
            {history.map((h) => {
              const meta = MOOD_META[h.mood];
              return (
                <li key={h.id}>
                  <article className="lc-card">
                    <div className="lc-cardmain">
                      {meta && <span className="lc-moodemoji" style={{ fontSize: 20 }} aria-hidden="true">{meta.emoji}</span>}
                      <span className="lc-cardtitle">{meta ? t(meta.key) : h.mood}</span>
                      <span className="lc-time">{relWhen(h.createdAt, locale)}</span>
                    </div>
                    {h.note && <p className="lc-sub">{h.note}</p>}
                    {h.aiResponse && <p className="lc-sub">{h.aiResponse}</p>}
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
