import { useCallback, useEffect, useState } from 'react';
import * as api from '@daycore/core';
import type { Boot, MoodCheckin, MoodKind } from '@daycore/core';

// 心情：点砖即打卡 + 可选便签 + 最近打卡。
//
// ⚠️ 砖集以共享 mock（design-ui/core/daycore-core.js 的 MOODS）为准——后端
// internal/domain/mood_kind.go 已原样收编这 12 个（开心/平静/被爱/兴奋/一般/
// 疲惫/压力大/焦虑/低落/烦躁/不舒服/失眠），所以直接读 moodKinds() 即可，
// 不碰 classic 原型页 page-mood.jsx 里那份私有旧列表。

function relWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function PageMood({ boot }: { boot: Boot }) {
  const t = boot.catalog.t;
  const locale = boot.catalog.locale;
  const [kinds, setKinds] = useState<MoodKind[]>([]);
  const [history, setHistory] = useState<MoodCheckin[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [k, h] = await Promise.all([api.moodKinds(), api.moodHistory(6)]);
      setKinds(k.kinds ?? []);
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
    const k = kinds.find((x) => x.id === picked);
    if (!k || busy) return;
    const text = note.trim();
    setBusy(true);
    setReply('');
    try {
      await api.recordMood(k.id, text);
      const r = await api.askMoodReply(k.id, text);
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
        {kinds.map((k) => (
          <button key={k.id} className={'lc-mood' + (picked === k.id ? ' on' : '')} disabled={busy} onClick={() => { setPicked(picked === k.id ? null : k.id); setReply(''); }}>
            <span className="lc-moodemoji" aria-hidden="true">{k.emoji}</span>
            <span className="lc-moodname">{k.name}</span>
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
              const k = kinds.find((x) => x.id === h.mood);
              return (
                <li key={h.id}>
                  <article className="lc-card">
                    <div className="lc-cardmain">
                      {k && <span className="lc-moodemoji" style={{ fontSize: 20 }} aria-hidden="true">{k.emoji}</span>}
                      <span className="lc-cardtitle">{k ? k.name : h.mood}</span>
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
