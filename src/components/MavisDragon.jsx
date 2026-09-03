import React, { useMemo, useRef, useState } from 'react';

const TASK_STATUSES = ['Ожидает', 'Новая', 'В работе', 'На проверке', 'Блокер', 'Готово'];
const PRIORITIES = ['Низкий', 'Средний', 'Высокий'];
const WEEKDAY_INDEX = {
  воскресенье: 0,
  воскресенья: 0,
  sunday: 0,
  понедельник: 1,
  понедельника: 1,
  monday: 1,
  вторник: 2,
  вторника: 2,
  tuesday: 2,
  среда: 3,
  среды: 3,
  wednesday: 3,
  четверг: 4,
  четверга: 4,
  thursday: 4,
  пятница: 5,
  пятницы: 5,
  friday: 5,
  суббота: 6,
  субботы: 6,
  saturday: 6,
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDays(dateIso, days) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextWeekday(targetDay, baseIso = todayIso()) {
  const date = new Date(`${baseIso}T12:00:00`);
  const current = date.getDay();
  let diff = (targetDay - current + 7) % 7;
  if (diff === 0) diff = 7;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function apiJson(url, options = {}) {
  return fetch(url, options)
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return payload;
    });
}

function normalizeDraft(raw = {}, fallbackOwner = '', collections = {}) {
  const employees = Array.isArray(collections.employees) ? collections.employees : [];
  const employeeNames = employees.filter((item) => item?.is_active !== false).map((item) => item.name);
  const safeOwner = employeeNames.includes(raw.owner) ? raw.owner : (fallbackOwner || employeeNames[0] || 'Саша');
  const safePriority = PRIORITIES.includes(raw.priority) ? raw.priority : 'Средний';
  const safeStatus = TASK_STATUSES.includes(raw.status) ? raw.status : 'Новая';
  return {
    selected: raw.selected !== false,
    title: String(raw.title || '').trim(),
    owner: safeOwner,
    deadline: String(raw.deadline || todayIso()).slice(0, 10),
    status: safeStatus,
    priority: safePriority,
    project_id: raw.project_id || '',
    section_id: raw.section_id || '',
    stage_id: raw.stage_id || '',
    result: String(raw.result || '').trim(),
    comment: String(raw.comment || '').trim(),
    evidence: String(raw.evidence || '').trim(),
    confidence: Number(raw.confidence || 0.7),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
  };
}

function guessOwner(text, employees, fallbackOwner) {
  const line = text.toLowerCase();
  const sorted = [...employees]
    .filter((item) => item?.is_active !== false && item?.name)
    .sort((a, b) => String(b.name).length - String(a.name).length);
  const found = sorted.find((item) => line.includes(String(item.name).toLowerCase()));
  return found?.name || fallbackOwner || sorted[0]?.name || 'Саша';
}

function guessDeadline(text) {
  const source = String(text || '').toLowerCase();
  const today = todayIso();
  if (/\bсегодня\b/.test(source)) return today;
  if (/\bзавтра\b/.test(source)) return addDays(today, 1);
  const isoMatch = source.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];
  const ruDateMatch = source.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (ruDateMatch) {
    const day = String(ruDateMatch[1]).padStart(2, '0');
    const month = String(ruDateMatch[2]).padStart(2, '0');
    const yearRaw = ruDateMatch[3];
    const year = yearRaw ? (yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : String(new Date().getFullYear());
    return `${year}-${month}-${day}`;
  }
  const weekdayMatch = source.match(/до\s+([а-яa-z]+)/i);
  if (weekdayMatch) {
    const target = WEEKDAY_INDEX[weekdayMatch[1].toLowerCase()];
    if (Number.isInteger(target)) return nextWeekday(target, today);
  }
  return today;
}

function guessPriority(text) {
  const source = String(text || '').toLowerCase();
  if (/срочно|urgent|важно|критично|горячо|приоритет/i.test(source)) return 'Высокий';
  if (/когда\s+будет\s+время|не\s+срочно|потом/i.test(source)) return 'Низкий';
  return 'Средний';
}

function stripControlWords(text, ownerName) {
  let cleaned = String(text || '').trim();
  if (ownerName) {
    const escaped = ownerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`^${escaped}[,:\-–—]?\\s*`, 'i'), '');
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '').trim();
  }
  cleaned = cleaned
    .replace(/\b(до\s+[а-яa-z]+|сегодня|завтра|срочно|важно|критично)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[—–-]\s*$/, '')
    .trim();
  return cleaned || String(text || '').trim();
}

function findProjectAndStage(text, projects, stages) {
  const source = String(text || '').toLowerCase();
  const sortedProjects = [...projects].sort((a, b) => String(b.name || '').length - String(a.name || '').length);
  const project = sortedProjects.find((item) => source.includes(String(item.name || '').toLowerCase()));
  const stagePool = project
    ? stages.filter((item) => String(item.project_id) === String(project.id))
    : stages;
  const stage = [...stagePool]
    .sort((a, b) => String(b.title || '').length - String(a.title || '').length)
    .find((item) => source.includes(String(item.title || '').toLowerCase()));
  return {
    project_id: project?.id || '',
    section_id: project?.section_id || '',
    stage_id: stage?.id || '',
  };
}

function fallbackDraft(line, { employees, projects, stages, currentUser }) {
  const owner = guessOwner(line, employees, currentUser?.employee_name || '');
  const placement = findProjectAndStage(line, projects, stages);
  return normalizeDraft({
    title: stripControlWords(line, owner),
    owner,
    deadline: guessDeadline(line),
    status: 'Новая',
    priority: guessPriority(line),
    comment: 'Создано из чата Mavis AI помощника.',
    evidence: line,
    confidence: 0.62,
    warnings: ['Автораспознавание без сервера ИИ — проверьте проект, срок и ответственного.'],
    ...placement,
  }, currentUser?.employee_name || owner, { employees });
}

function splitInputToLines(raw) {
  return String(raw || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .flatMap((line) => line.split(/\s*;\s*/g))
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function MavisDragon({ sections = [], projects = [], stages = [], employees = [], currentUser = null, onCreateTasks }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Привет! Я помощник Mavis 💕 Напиши задачу как удобно: «Таня проверяет CRM до пятницы» или сразу несколько задач с новой строки.',
    },
  ]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  const activeEmployees = useMemo(() => employees.filter((item) => item?.is_active !== false), [employees]);
  const visibleProjects = useMemo(() => projects.filter((item) => !item?.archived && !item?.backlog), [projects]);
  const visibleStages = useMemo(() => stages.filter((item) => !item?.archived && !item?.backlog), [stages]);
  const context = useMemo(() => ({
    today: todayIso(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Minsk',
    currentEmployee: currentUser ? { name: currentUser.employee_name, role: currentUser.employee_role } : null,
    sections: sections.map(({ id, name, description }) => ({ id, name, description })),
    projects: visibleProjects.map(({ id, name, description, section_id, owner, customer, status }) => ({ id, name, description, section_id, owner, customer, status })),
    stages: visibleStages.map(({ id, project_id, title, description, owner, deadline }) => ({ id, project_id, title, description, owner, deadline })),
    employees: activeEmployees.map(({ id, name, role }) => ({ id, name, role })),
  }), [sections, visibleProjects, visibleStages, activeEmployees, currentUser]);

  async function buildDrafts(lines) {
    const drafts = [];
    for (const line of lines) {
      try {
        const structured = await apiJson('/api/ai/structure-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: line, context }),
        });
        drafts.push(normalizeDraft(structured.task, currentUser?.employee_name || '', { employees: activeEmployees }));
      } catch (error) {
        drafts.push(fallbackDraft(line, { employees: activeEmployees, projects: visibleProjects, stages: visibleStages, currentUser }));
      }
    }
    return drafts.filter((draft) => draft.title);
  }

  async function sendMessage() {
    const raw = text.trim();
    if (!raw || sending) return;
    const userMessage = { id: `user-${Date.now()}`, role: 'user', text: raw };
    setMessages((items) => [...items, userMessage]);
    setText('');
    setSending(true);

    try {
      const lines = splitInputToLines(raw);
      const drafts = await buildDrafts(lines);
      if (!drafts.length) throw new Error('Не получилось распознать задачу.');
      await onCreateTasks?.(drafts);
      const createdTitles = drafts.map((item, index) => `${index + 1}. ${item.title}`).join('\n');
      const reply = drafts.length === 1
        ? `Готово ✨ Создала задачу «${drafts[0].title}». Ответственный: ${drafts[0].owner}. Срок: ${drafts[0].deadline}.`
        : `Готово ✨ Создала ${drafts.length} задач:\n${createdTitles}`;
      setMessages((items) => [...items, { id: `assistant-${Date.now()}`, role: 'assistant', text: reply }]);
      setOpen(true);
    } catch (error) {
      setMessages((items) => [...items, { id: `assistant-${Date.now()}`, role: 'assistant', text: `Не получилось создать задачу: ${error.message}` }]);
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-3">
      {!open && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="pointer-events-auto max-w-[280px] rounded-3xl border border-pink-200 bg-white/95 px-4 py-3 text-left shadow-[0_18px_40px_rgba(244,114,182,0.18)] backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-200 via-fuchsia-200 to-violet-200 text-2xl shadow-inner">
                🐲
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Привет! Я помощник Mavis</div>
                <div className="mt-1 text-sm text-slate-600">Поставь мне задачу — я быстро создам её в системе 💕</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 via-fuchsia-400 to-violet-500 text-3xl shadow-[0_18px_40px_rgba(192,132,252,0.35)] transition hover:scale-105"
            title="Mavis AI помощник"
          >
            🐲
          </button>
        </>
      )}

      {open && (
        <div className="pointer-events-auto w-[min(430px,calc(100vw-24px))] overflow-hidden rounded-[2rem] border border-pink-100 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-pink-100 bg-gradient-to-r from-pink-50 via-rose-50 to-violet-50 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-300 via-fuchsia-300 to-violet-300 text-2xl shadow-inner">
                🐲
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-900">Mavis AI помощник</div>
                <div className="text-sm text-slate-500">Пиши задачу в свободной форме</div>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-2xl leading-none text-slate-500 transition hover:bg-white hover:text-slate-800">×</button>
          </div>

          <div className="max-h-[380px] space-y-3 overflow-y-auto bg-gradient-to-b from-white to-rose-50/30 px-4 py-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-violet-600 text-white' : 'bg-pink-50 text-slate-700'}`}>
                  {message.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-3xl bg-pink-50 px-4 py-3 text-sm text-slate-600">Создаю задачу...</div>
              </div>
            )}
          </div>

          <div className="border-t border-pink-100 bg-white p-4">
            <div className="rounded-[1.75rem] border border-violet-200 p-2 shadow-[0_0_0_4px_rgba(233,213,255,0.55)]">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={2}
                  placeholder="Напишите задачи..."
                  className="min-h-[56px] flex-1 resize-none rounded-[1.25rem] border-0 px-4 py-3 text-lg text-slate-700 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={sending || !text.trim()}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-fuchsia-500 to-violet-600 text-2xl text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Отправить"
                >
                  ➤
                </button>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500">Можно написать несколько задач — по одной на строку.</div>
          </div>
        </div>
      )}
    </div>
  );
}
