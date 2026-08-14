import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@daycore/core';
import type {
  Boot,
  ChatMessage,
  ChatThread,
  DecisionCardFrame,
  ToolResultFrame,
} from '@daycore/core';
import { foldToolFrames, parseToolEvents, toolLinkTarget } from './companion';
import { Icon } from './Icon';
import type { Nav } from './App';

// 陪伴：一个可以走开的对话。
//
// ⚠️ The async endpoint, not the streaming one, and that is a paradigm decision
// rather than a technical preference. A five-page app's whole premise is that
// you can leave a page — so a turn that dies when this tab loses focus is a
// turn the reader has to sit and watch, which is exactly the thing the other
// three frontends do not have to worry about because they never navigate away.
//
// POST /api/ai/companion/async answers 202 with a message id; the reply is
// written into the thread by a background turn and this polls for it. The
// assistant's tool work arrives as the message's `toolEvents` — a JSON string of
// SSE v2 frames (tool_start / tool_result / decision_card) — rendered exactly
// like the streaming frames: action cards with undo, and decision cards.

const POLL_MS = 2500;
/** ⚠️ A ceiling, so a turn that dies leaves a stopped spinner rather than a
 *  page that polls a dead id until the tab closes. */
const POLL_MAX = 120;

// 原型 TOOL_ICON：工具 → 图标（design-ui/page-companion.jsx）。
const TOOL_ICON: Record<string, string> = {
  get_weather: 'sun',
  web_search: 'search',
  list_upcoming: 'listChecks',
  plan_add: 'calendarPlus',
  plan_update: 'calendarDays',
  plan_remove: 'trash',
  rule_upsert: 'repeat',
  rule_remove: 'repeat',
  memory_add: 'brain',
  memory_remove: 'brain',
};

function ToolCard({
  tool,
  state,
  result,
  nav,
  t,
  onError,
}: {
  tool: string;
  state: 'running' | 'done';
  result?: ToolResultFrame;
  nav: Nav;
  t: Boot['catalog']['t'];
  onError: (msg: string) => void;
}) {
  const [undone, setUndone] = useState(false);
  const name = t(`tool.${tool}`);

  if (state === 'running') {
    return (
      <div className="lc-tool is-running">
        <span className="lc-spin" aria-hidden="true" />
        <span>{t('companion.toolRunning', { name })}</span>
      </div>
    );
  }

  if (!result?.ok) {
    return (
      <div className="lc-tool is-fail">
        <Icon name="x" size={15} />
        <span>{t('companion.toolFailed', { name })}</span>
      </div>
    );
  }

  const link = toolLinkTarget(tool);

  async function undo() {
    if (!result?.opId) return;
    try {
      await api.revertOp(result.opId);
      setUndone(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className={'lc-tool' + (undone ? ' is-undone' : ' is-ok')}>
      <Icon name={TOOL_ICON[tool] || 'sparkles'} size={15} />
      <span className="lc-toolsum">{result.summary || name}</span>
      {undone ? (
        <span className="lc-toolundone">{t('companion.undone')}</span>
      ) : (
        <>
          {link && (
            <button
              className="lc-link"
              onClick={() => nav.go(link === 'rules' ? 'materials' : link === 'memory' ? 'settings' : 'today', link === 'rules' ? { rules: '1' } : undefined)}
            >
              {t(link === 'rules' ? 'companion.viewRules' : link === 'memory' ? 'companion.viewMemory' : 'companion.viewPlan')}
            </button>
          )}
          {result.opId && (
            <button className="lc-link undo" onClick={() => void undo()}>
              {t('companion.undo')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function DecisionCard({
  ev,
  pending,
  t,
  onError,
}: {
  ev: DecisionCardFrame;
  pending: boolean;
  t: Boot['catalog']['t'];
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState('');
  const [answered, setAnswered] = useState(false);

  async function respond(choice: string, own?: string) {
    try {
      await api.respondToDecision(ev.id, choice, own);
      setAnswered(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  // ⚠️ A card is actionable only while its turn is still running (message status
  // "pending"). Once the message is done the agent has settled the card — the
  // wire's decision_card frame carries no state field, so "was it answered" is
  // read off the turn, not off the frame.
  const live = pending && !answered;

  return (
    <div className={'lc-decision' + (live ? '' : ' is-done')}>
      <div className="lc-dechead">
        <span className="lc-decicon"><Icon name="messageCircle" size={15} /></span>
        <span className="lc-dectitle">{ev.title}</span>
      </div>
      {ev.summary && <p className="lc-decsum">{ev.summary}</p>}
      {live ? (
        <>
          <div className="lc-decopts">
            {ev.options.map((o) => (
              <button key={o.id} className="lc-decopt" onClick={() => void respond(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="lc-deccustom">
            <input
              placeholder={t('companion.decisionCustomPh')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text.trim()) {
                  e.preventDefault();
                  void respond('', text.trim());
                }
              }}
            />
            <button
              aria-label={t('common.save')}
              disabled={!text.trim()}
              onClick={() => text.trim() && void respond('', text.trim())}
            >
              <Icon name="arrowUp" size={15} />
            </button>
          </div>
          <p className="lc-dechint">{t('companion.decisionTimeoutHint')}</p>
        </>
      ) : (
        <div className="lc-decanswered">{t('companion.decisionDone')}</div>
      )}
    </div>
  );
}

export function PageCompanion({ boot, nav }: { boot: Boot; nav: Nav }) {
  const t = boot.catalog.t;
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [thOpen, setThOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stop = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { stop.current = true; }, []);

  const loadThreads = useCallback(async () => {
    try {
      const { threads: list } = await api.threads();
      setThreads(list ?? []);
      setCurrent((c) => c ?? list?.[0]?.id ?? null);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const { messages: list } = await api.threadMessages(id);
      // ⚠️ The endpoint answers newest-first (it is a cursor over a descending
      // index). Rendering it as-is puts the conversation in reverse.
      setMessages([...(list ?? [])].reverse());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (current) void loadMessages(current);
  }, [current, loadMessages]);

  // ⚠️ A decision card blocks the agent; while it is unanswered the composer
  // reads "waiting on a decision" rather than inviting a second turn that would
  // cancel the first.
  const pendingDecision = messages.some(
    (m) => m.status === 'pending' && parseToolEvents(m.toolEvents).some((f) => f.type === 'decision_card'),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pendingDecision]);

  async function newThread() {
    try {
      const th = await api.createThread();
      // ⚠️ Select the new thread, not just reload the list — a fresh conversation
      // should BE the one you are looking at, otherwise the composer keeps
      // writing into the old one and the reader has to hunt for where it went.
      setCurrent(th.id);
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || pendingDecision) return;
    let threadId = current;
    setBusy(true);
    setError('');
    try {
      if (!threadId) {
        const th = await api.createThread();
        threadId = th.id;
        setCurrent(th.id);
        await loadThreads();
      }
      setDraft('');
      const { messageId } = await api.askCompanion(threadId, text);
      await loadMessages(threadId);
      for (let i = 0; i < POLL_MAX && !stop.current; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const m = await api.chatMessage(messageId);
        // An empty status means done. Old rows predate the column.
        if (m.status !== 'pending') {
          await loadMessages(threadId);
          if (m.status === 'error') setError(t('companion.failed'));
          break;
        }
        // Still running: reload the thread so tool cards and a decision card
        // land as they are emitted, not only when the turn finally settles.
        await loadMessages(threadId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lc-page lc-chat">
      <div className="lc-thread-bar">
        <button className="lc-thread-pill" onClick={() => setThOpen(true)}>
          <Icon name="messagesSquare" size={15} />
          <span>{threads.find((th) => th.id === current)?.title || t('companion.untitled')}</span>
          <Icon name="chevronDown" size={14} />
        </button>
        <span className="lc-thread-async">{t('companion.asyncNote')}</span>
      </div>

      {error && <p className="lc-err">{error}</p>}

      <div className="lc-chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="lc-empty">{t('companion.empty')}</p>
        ) : (
          <div className="lc-list">
            {messages.map((m) => {
              const actions = foldToolFrames(parseToolEvents(m.toolEvents));
              const running = m.status === 'pending';
              return (
                <Fragment key={m.id}>
                  {actions.map((a, i) =>
                    a.kind === 'decision' ? (
                      <DecisionCard key={'dc' + (a.card.id || i)} ev={a.card} pending={running} t={t} onError={setError} />
                    ) : (
                      <ToolCard
                        key={'tc' + (a.callId || i)}
                        tool={a.tool}
                        state={a.state}
                        result={a.result}
                        nav={nav}
                        t={t}
                        onError={setError}
                      />
                    ),
                  )}
                  {m.role === 'user' ? (
                    <article className="lc-bubble me">{m.content}</article>
                  ) : m.content ? (
                    <article className={'lc-bubble them' + (m.status === 'error' ? ' err' : '')}>
                      {m.content}
                      {running ? <span className="lc-thinking">…</span> : null}
                    </article>
                  ) : running ? (
                    <article className="lc-bubble them">
                      <span className="lc-sub">{t('companion.thinking')}</span>
                    </article>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      <form
        className="lc-form lc-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="lc-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={pendingDecision ? t('companion.decisionWait') : t('companion.placeholder')}
          aria-label={t('companion.placeholder')}
          disabled={busy || pendingDecision}
        />
        <button className="lc-btn pri" type="submit" disabled={busy || pendingDecision || !draft.trim()} aria-label={t('companion.send')}>
          <Icon name="arrowUp" size={18} />
        </button>
      </form>

      {thOpen && (
        <div className="lc-sheet-backdrop" onClick={() => setThOpen(false)}>
          <div className="lc-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="lc-sheet-head">
              <h2 className="lc-sheet-title">{t('companion.threadSwitch')}</h2>
              <button className="lc-sheet-close" onClick={() => setThOpen(false)} aria-label="×">×</button>
            </div>
            <div className="lc-sheet-body">
              <button className="lc-btn sec" onClick={() => void newThread().then(() => setThOpen(false))}>
                <Icon name="plus" size={16} /> {t('companion.newThread')}
              </button>
              <ul className="lc-list">
                {threads.map((th) => (
                  <li key={th.id}>
                    <button className={'lc-thread-row' + (current === th.id ? ' on' : '')} onClick={() => { setCurrent(th.id); setThOpen(false); }}>
                      <span className="lc-thread-title">{th.title || t('companion.untitled')}</span>
                      {current === th.id && <Icon name="check" size={15} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
