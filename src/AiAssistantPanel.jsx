import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  FileAudio,
  FileUp,
  Loader2,
  Mic,
  PauseCircle,
  PlayCircle,
  Sparkles,
  Square,
  Trash2,
  WandSparkles,
} from 'lucide-react';

const TASK_STATUSES = ['Ожидает', 'Новая', 'В работе', 'На проверке', 'Блокер', 'Готово'];
const PRIORITIES = ['Низкий', 'Средний', 'Высокий'];
const MEETING_SEGMENT_MS = 10 * 60 * 1000;
const TRANSCRIBE_MAX_ATTEMPTS = 3;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatElapsed(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function recorderMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function audioExtension(mimeType) {
  return String(mimeType || '').includes('mp4') ? 'm4a' : 'webm';
}

async function apiJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    const error = new Error(cause?.message || 'Failed to fetch');
    error.code = 'network_error';
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    const retryAfter = Number(response.headers.get('Retry-After') || 0);
    if (retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
    throw error;
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableTranscriptionError(error) {
  if (!error?.status) return true;
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(error.status));
}


function normalizedDraft(raw = {}, fallbackOwner = '') {
  return {
    selected: raw.selected !== false,
    title: String(raw.title || '').trim(),
    owner: String(raw.owner || fallbackOwner || '').trim(),
    deadline: String(raw.deadline || '').slice(0, 10),
    status: TASK_STATUSES.includes(raw.status) ? raw.status : 'Новая',
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'Средний',
    project_id: raw.project_id || '',
    section_id: raw.section_id || '',
    stage_id: raw.stage_id || '',
    result: String(raw.result || '').trim(),
    comment: String(raw.comment || '').trim(),
    evidence: String(raw.evidence || '').trim(),
    confidence: Number(raw.confidence || 0),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
  };
}

function DraftEditor({ draft, index, sections, projects, stages, employees, onChange, onRemove }) {
  const project = projects.find((item) => String(item.id) === String(draft.project_id));
  const availableStages = stages.filter((item) => String(item.project_id) === String(draft.project_id));

  function patch(payload) {
    onChange(index, { ...draft, ...payload });
  }

  function handleProject(value) {
    const selectedProject = projects.find((item) => String(item.id) === String(value));
    patch({
      project_id: value,
      section_id: selectedProject?.section_id || '',
      stage_id: '',
    });
  }

  return (
    <div className={`rounded-2xl border p-4 ${draft.selected ? 'border-violet-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="flex min-w-0 items-start gap-3">
          <input type="checkbox" checked={draft.selected} onChange={(event) => patch({ selected: event.target.checked })} className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600" />
          <span className="min-w-0"><b className="block text-sm">Черновик задачи {index + 1}</b><span className="text-xs text-slate-500">Уверенность ИИ: {Math.round((draft.confidence || 0) * 100)}%</span></span>
        </label>
        {onRemove && <button type="button" onClick={() => onRemove(index)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-600">Задача</span><input value={draft.title} onChange={(event) => patch({ title: event.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm" /></label>
        <label><span className="mb-1 block text-xs font-medium text-slate-600">Проект</span><select value={draft.project_id} onChange={(event) => handleProject(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="">Без проекта</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-medium text-slate-600">Этап</span><select value={draft.stage_id} disabled={!draft.project_id} onChange={(event) => patch({ stage_id: event.target.value })} className="w-full rounded-xl border bg-white px-3 py-2 text-sm disabled:bg-slate-100"><option value="">Без этапа</option>{availableStages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {!draft.project_id && <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-600">Раздел</span><select value={draft.section_id} onChange={(event) => patch({ section_id: event.target.value })} className="w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="">Без раздела</option>{sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {draft.project_id && <div className="md:col-span-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">Раздел: {sections.find((item) => String(item.id) === String(project?.section_id))?.name || 'не определён'}</div>}
        <label><span className="mb-1 block text-xs font-medium text-slate-600">Ответственный</span><select value={draft.owner} onChange={(event) => patch({ owner: event.target.value })} className="w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="">Не определён</option>{employees.filter((item) => item.is_active !== false).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-medium text-slate-600">Дедлайн</span><input type="date" value={draft.deadline} onChange={(event) => patch({ deadline: event.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm" /></label>
        <label><span className="mb-1 block text-xs font-medium text-slate-600">Статус</span><select value={draft.status} onChange={(event) => patch({ status: event.target.value })} className="w-full rounded-xl border bg-white px-3 py-2 text-sm">{TASK_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-medium text-slate-600">Приоритет</span><select value={draft.priority} onChange={(event) => patch({ priority: event.target.value })} className="w-full rounded-xl border bg-white px-3 py-2 text-sm">{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-600">Результат</span><textarea value={draft.result} onChange={(event) => patch({ result: event.target.value })} rows="2" className="w-full rounded-xl border px-3 py-2 text-sm" /></label>
        <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-600">Комментарий</span><textarea value={draft.comment} onChange={(event) => patch({ comment: event.target.value })} rows="2" className="w-full rounded-xl border px-3 py-2 text-sm" /></label>
      </div>

      {draft.evidence && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>Основание из встречи:</b> {draft.evidence}</div>}
      {draft.warnings?.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><b>Нужно проверить:</b> {draft.warnings.join(' · ')}</div>}
    </div>
  );
}

export default function AiAssistantPanel({ sections, projects, stages, employees, currentUser, onCreateTasks }) {
  const [health, setHealth] = useState({ loading: true, configured: false, model: '' });
  const [globalError, setGlobalError] = useState('');

  const [quickRecording, setQuickRecording] = useState(false);
  const [quickElapsed, setQuickElapsed] = useState(0);
  const [quickProcessing, setQuickProcessing] = useState(false);
  const [quickTranscript, setQuickTranscript] = useState('');
  const [quickDrafts, setQuickDrafts] = useState([]);
  const quickRecorderRef = useRef(null);
  const quickStreamRef = useRef(null);
  const quickChunksRef = useRef([]);
  const quickTimerRef = useRef(null);

  const [meetingActive, setMeetingActive] = useState(false);
  const [meetingElapsed, setMeetingElapsed] = useState(0);
  const [meetingPending, setMeetingPending] = useState(0);
  const [meetingSegments, setMeetingSegments] = useState([]);
  const [meetingFailedSegments, setMeetingFailedSegments] = useState([]);
  const [meetingDrafts, setMeetingDrafts] = useState([]);
  const [meetingSummary, setMeetingSummary] = useState('');
  const [meetingDecisions, setMeetingDecisions] = useState([]);
  const [meetingExtracting, setMeetingExtracting] = useState(false);
  const meetingActiveRef = useRef(false);
  const meetingStreamRef = useRef(null);
  const meetingRecorderRef = useRef(null);
  const meetingChunksRef = useRef([]);
  const meetingSegmentTimeoutRef = useRef(null);
  const meetingTimerRef = useRef(null);
  const meetingSegmentIndexRef = useRef(0);
  const meetingQueueRef = useRef(Promise.resolve());

  const activeProjects = useMemo(() => projects.filter((item) => !item.archived_at && item.status !== 'Готово'), [projects]);
  const context = useMemo(() => ({
    today: todayIso(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Minsk',
    currentEmployee: currentUser ? { name: currentUser.employee_name, role: currentUser.employee_role } : null,
    sections: sections.map(({ id, name, description }) => ({ id, name, description })),
    projects: activeProjects.map(({ id, name, description, section_id, owner, customer, status }) => ({ id, name, description, section_id, owner, customer, status })),
    stages: stages.filter((stage) => activeProjects.some((project) => String(project.id) === String(stage.project_id))).map(({ id, project_id, title, description }) => ({ id, project_id, title, description })),
    employees: employees.filter((item) => item.is_active !== false).map(({ id, name, role }) => ({ id, name, role })),
  }), [sections, activeProjects, stages, employees, currentUser]);

  useEffect(() => {
    apiJson('/api/ai/health')
      .then((data) => setHealth({ loading: false, ...data }))
      .catch((error) => setHealth({ loading: false, configured: false, error: error.message }));
    return () => {
      clearInterval(quickTimerRef.current);
      clearInterval(meetingTimerRef.current);
      clearTimeout(meetingSegmentTimeoutRef.current);
      quickStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      meetingStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  function updateDraft(setter, index, value) {
    setter((items) => items.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  async function transcribeBlob(blob, filename, maxAttempts = TRANSCRIBE_MAX_ATTEMPTS) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const form = new FormData();
        form.append('audio', blob, filename);
        form.append('language', 'ru');
        return await apiJson('/api/ai/transcribe', { method: 'POST', body: form });
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !isRetryableTranscriptionError(error)) throw error;
        const delay = error?.retryAfterMs || (attempt === 1 ? 2500 : 7000);
        await sleep(delay);
      }
    }
    throw lastError || new Error('Не удалось расшифровать аудио.');
  }

  async function startQuickRecording() {
    setGlobalError('');
    setQuickTranscript('');
    setQuickDrafts([]);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setGlobalError('Браузер не поддерживает запись с микрофона. Используйте актуальный Chrome или Edge через HTTPS.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      quickStreamRef.current = stream;
      quickChunksRef.current = [];
      const mimeType = recorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      quickRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data?.size) quickChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        clearInterval(quickTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        setQuickRecording(false);
        const blob = new Blob(quickChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (!blob.size) return setGlobalError('Запись получилась пустой.');
        setQuickProcessing(true);
        try {
          const transcription = await transcribeBlob(blob, `voice-task.${audioExtension(blob.type)}`);
          setQuickTranscript(transcription.text || '');
          const structured = await apiJson('/api/ai/structure-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: transcription.text, context }),
          });
          setQuickDrafts([normalizedDraft(structured.task, currentUser?.employee_name)]);
        } catch (error) {
          setGlobalError(error.message);
        } finally {
          setQuickProcessing(false);
        }
      };
      recorder.start(1000);
      setQuickElapsed(0);
      setQuickRecording(true);
      quickTimerRef.current = setInterval(() => setQuickElapsed((value) => value + 1), 1000);
    } catch (error) {
      setGlobalError(`Не удалось включить микрофон: ${error.message}`);
    }
  }

  function stopQuickRecording() {
    if (quickRecorderRef.current?.state === 'recording') quickRecorderRef.current.stop();
  }

  async function analyzeEditedTranscript() {
    if (!quickTranscript.trim()) return;
    setQuickProcessing(true);
    setGlobalError('');
    try {
      const structured = await apiJson('/api/ai/structure-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: quickTranscript, context }),
      });
      setQuickDrafts([normalizedDraft(structured.task, currentUser?.employee_name)]);
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setQuickProcessing(false);
    }
  }

  async function processMeetingSegment(blob, index, { keepFailed = true } = {}) {
    const filename = `meeting-${index + 1}.${audioExtension(blob.type)}`;
    try {
      const transcription = await transcribeBlob(blob, filename);
      setMeetingSegments((items) => [...items.filter((item) => item.index !== index), { index, text: transcription.text || '' }].sort((a, b) => a.index - b.index));
      setMeetingFailedSegments((items) => items.filter((item) => item.index !== index));
      return true;
    } catch (error) {
      if (keepFailed) {
        setMeetingFailedSegments((items) => [
          ...items.filter((item) => item.index !== index),
          { index, blob, filename, error: error.message || 'Ошибка расшифровки' },
        ].sort((a, b) => a.index - b.index));
      }
      setGlobalError(`Не удалось расшифровать часть ${index + 1} после 3 попыток: ${error.message}. Аудио сохранено в этой вкладке — его можно повторить.`);
      return false;
    }
  }

  function enqueueMeetingSegment(blob, index) {
    setMeetingPending((value) => value + 1);
    meetingQueueRef.current = meetingQueueRef.current
      .catch(() => null)
      .then(() => processMeetingSegment(blob, index))
      .finally(() => setMeetingPending((value) => Math.max(0, value - 1)));
    return meetingQueueRef.current;
  }

  async function retryFailedMeetingSegment(item) {
    setGlobalError('');
    setMeetingPending((value) => value + 1);
    try {
      await processMeetingSegment(item.blob, item.index);
    } finally {
      setMeetingPending((value) => Math.max(0, value - 1));
    }
  }

  function skipFailedMeetingSegment(index) {
    setMeetingFailedSegments((items) => items.filter((item) => item.index !== index));
    setGlobalError('');
  }

  function startMeetingSegment(stream) {
    meetingChunksRef.current = [];
    const mimeType = recorderMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const segmentIndex = meetingSegmentIndexRef.current++;
    meetingRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data?.size) meetingChunksRef.current.push(event.data); };
    recorder.onstop = () => {
      clearTimeout(meetingSegmentTimeoutRef.current);
      const blob = new Blob(meetingChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
      if (meetingActiveRef.current) startMeetingSegment(stream);
      else stream.getTracks().forEach((track) => track.stop());
      if (blob.size) enqueueMeetingSegment(blob, segmentIndex);
    };
    recorder.start(1000);
    meetingSegmentTimeoutRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, MEETING_SEGMENT_MS);
  }

  async function startMeeting() {
    setGlobalError('');
    setMeetingSegments([]);
    setMeetingFailedSegments([]);
    setMeetingDrafts([]);
    setMeetingSummary('');
    setMeetingDecisions([]);
    setMeetingPending(0);
    meetingSegmentIndexRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      meetingStreamRef.current = stream;
      meetingActiveRef.current = true;
      setMeetingActive(true);
      setMeetingElapsed(0);
      meetingTimerRef.current = setInterval(() => setMeetingElapsed((value) => value + 1), 1000);
      startMeetingSegment(stream);
    } catch (error) {
      setGlobalError(`Не удалось включить микрофон: ${error.message}`);
    }
  }

  function stopMeeting() {
    meetingActiveRef.current = false;
    setMeetingActive(false);
    clearInterval(meetingTimerRef.current);
    clearTimeout(meetingSegmentTimeoutRef.current);
    if (meetingRecorderRef.current?.state === 'recording') meetingRecorderRef.current.stop();
    else meetingStreamRef.current?.getTracks?.().forEach((track) => track.stop());
  }

  async function uploadMeetingFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setGlobalError('');
    setMeetingDrafts([]);
    const startIndex = meetingSegments.length;
    for (let index = 0; index < list.length; index += 1) {
      setMeetingPending((value) => value + 1);
      try {
        await processMeetingSegment(list[index], startIndex + index);
      } finally {
        setMeetingPending((value) => Math.max(0, value - 1));
      }
    }
  }

  const meetingTranscript = useMemo(() => meetingSegments.map((item) => `[Часть ${item.index + 1}]\n${item.text}`).join('\n\n'), [meetingSegments]);

  async function extractMeetingTasks() {
    if (!meetingTranscript.trim()) return;
    setMeetingExtracting(true);
    setGlobalError('');
    try {
      const result = await apiJson('/api/ai/extract-meeting-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: meetingTranscript, context }),
      });
      setMeetingSummary(String(result.meeting_summary || ''));
      setMeetingDecisions(Array.isArray(result.decisions) ? result.decisions : []);
      setMeetingDrafts((Array.isArray(result.tasks) ? result.tasks : []).map((item) => normalizedDraft(item, '')));
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setMeetingExtracting(false);
    }
  }

  async function confirmDrafts(drafts, reset) {
    const selected = drafts.filter((item) => item.selected);
    const invalid = selected.find((item) => !item.title.trim() || !item.owner || !item.deadline);
    if (!selected.length) return setGlobalError('Выберите хотя бы одну задачу для создания.');
    if (invalid) return setGlobalError('У каждой выбранной задачи должны быть название, ответственный и дедлайн.');
    setGlobalError('');
    try {
      await onCreateTasks(selected);
      reset();
    } catch (error) {
      setGlobalError(error.message);
    }
  }

  const disabledReason = !health.loading && !health.configured ? (health.error || 'На сервере не задан VIBECODE_API_KEY.') : '';

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="mb-2 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-violet-100"><Sparkles className="mr-2 h-3.5 w-3.5" />Bitrix24 Вайбкод AI</div><h2 className="text-2xl font-bold">Голосовые задачи и протокол встреч</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">ИИ расшифровывает голос, сопоставляет поручение с существующими разделами, проектами и этапами. Ничего не создаётся без ручного подтверждения.</p></div>
          <div className={`rounded-2xl px-4 py-3 text-sm ring-1 ${health.configured ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/20' : 'bg-rose-400/10 text-rose-100 ring-rose-300/20'}`}>{health.loading ? 'Проверяем подключение…' : health.configured ? `Подключено · ${health.model}` : 'ИИ не настроен на сервере'}</div>
        </div>
      </div>

      {(globalError || disabledReason) && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{globalError || disabledReason}</span></div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-2xl bg-violet-100 p-3 text-violet-700"><Mic className="h-5 w-5" /></span><div><h3 className="text-lg font-bold">1. Поставить задачу голосом</h3><p className="mt-1 text-sm text-slate-500">Назовите задачу, ответственного, проект и срок. Раздел можно не называть — ИИ определит его по проекту или смыслу.</p></div></div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!quickRecording ? <button type="button" disabled={!health.configured || quickProcessing} onClick={startQuickRecording} className="inline-flex items-center rounded-2xl bg-violet-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"><Mic className="mr-2 h-5 w-5" />Начать запись</button> : <button type="button" onClick={stopQuickRecording} className="inline-flex items-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-medium text-white"><Square className="mr-2 h-4 w-4 fill-current" />Остановить</button>}
            {quickRecording && <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700"><span className="mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />{formatElapsed(quickElapsed)}</span>}
            {quickProcessing && <span className="inline-flex items-center text-sm text-violet-700"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Расшифровываю и определяю проект…</span>}
          </div>

          {quickTranscript && <div className="mt-4"><label className="mb-1 block text-xs font-medium text-slate-600">Расшифровка — можно исправить перед повторным анализом</label><textarea value={quickTranscript} onChange={(event) => setQuickTranscript(event.target.value)} rows="5" className="w-full rounded-2xl border px-3 py-2 text-sm" /><button type="button" onClick={analyzeEditedTranscript} disabled={quickProcessing} className="mt-2 inline-flex items-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700"><WandSparkles className="mr-2 h-4 w-4" />Проанализировать заново</button></div>}

          {quickDrafts.length > 0 && <div className="mt-4 space-y-3"><DraftEditor draft={quickDrafts[0]} index={0} sections={sections} projects={activeProjects} stages={stages} employees={employees} onChange={(index, value) => updateDraft(setQuickDrafts, index, value)} /><button type="button" onClick={() => confirmDrafts(quickDrafts, () => { setQuickDrafts([]); setQuickTranscript(''); })} className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white"><CheckCircle2 className="mr-2 h-5 w-5" />Подтвердить и создать задачу</button></div>}
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-2xl bg-sky-100 p-3 text-sky-700"><AudioLines className="h-5 w-5" /></span><div><h3 className="text-lg font-bold">2. Записать встречу РНП</h3><p className="mt-1 text-sm text-slate-500">Запись автоматически делится на части по 10 минут и расшифровывается по очереди. При сетевой ошибке приложение повторяет запрос до 3 раз и не теряет нерасшифрованный фрагмент.</p></div></div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!meetingActive ? <button type="button" disabled={!health.configured} onClick={startMeeting} className="inline-flex items-center rounded-2xl bg-sky-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"><PlayCircle className="mr-2 h-5 w-5" />Начать встречу</button> : <button type="button" onClick={stopMeeting} className="inline-flex items-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-medium text-white"><PauseCircle className="mr-2 h-5 w-5" />Завершить запись</button>}
            {meetingActive && <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700"><span className="mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />{formatElapsed(meetingElapsed)}</span>}
            {meetingPending > 0 && <span className="inline-flex items-center text-sm text-sky-700"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Расшифровывается частей: {meetingPending}</span>}
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 hover:border-sky-300 hover:bg-sky-50"><FileUp className="mr-2 h-5 w-5" />Или загрузить готовые аудиофайлы<input type="file" accept="audio/*,video/*" multiple className="hidden" onChange={(event) => uploadMeetingFiles(event.target.files)} /></label>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-50 p-3"><b className="block text-lg text-slate-900">{meetingSegments.length}</b>частей готово</div><div className="rounded-xl bg-slate-50 p-3"><b className="block text-lg text-slate-900">{meetingPending}</b>в очереди / обработке</div><div className="rounded-xl bg-slate-50 p-3"><b className="block text-lg text-slate-900">{meetingDrafts.length}</b>задач найдено</div></div>
          {meetingFailedSegments.length > 0 && <div className="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3"><div className="text-sm font-semibold text-amber-900">Не расшифровано частей: {meetingFailedSegments.length}. Аудио сохранено в текущей вкладке.</div>{meetingFailedSegments.map((item) => <div key={item.index} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><b>Часть {item.index + 1}</b><div className="text-xs text-slate-500">{item.error}</div></div><div className="flex gap-2"><button type="button" disabled={meetingPending > 0} onClick={() => retryFailedMeetingSegment(item)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Повторить</button><button type="button" disabled={meetingPending > 0} onClick={() => skipFailedMeetingSegment(item.index)} className="rounded-lg border px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-50">Пропустить</button></div></div>)}</div>}
          {meetingSegments.length > 0 && meetingFailedSegments.length === 0 && !meetingActive && meetingPending === 0 && <button type="button" disabled={meetingExtracting} onClick={extractMeetingTasks} className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 font-medium text-white"><WandSparkles className="mr-2 h-5 w-5" />{meetingExtracting ? 'Анализирую встречу…' : 'Выделить решения и задачи'}</button>}
        </section>
      </div>

      {(meetingSummary || meetingDecisions.length > 0) && <section className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="font-bold">Итоги встречи</h3>{meetingSummary && <p className="mt-2 text-sm leading-6 text-slate-600">{meetingSummary}</p>}{meetingDecisions.length > 0 && <div className="mt-3 space-y-2">{meetingDecisions.map((item, index) => <div key={index} className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{item}</div>)}</div>}</section>}

      {meetingDrafts.length > 0 && <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-lg font-bold">Черновики задач из встречи</h3><p className="text-sm text-slate-500">Проверьте проект, ответственного и срок. Снимите галочку с задач, которые создавать не нужно.</p></div><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">Ручное подтверждение обязательно</span></div><div className="space-y-3">{meetingDrafts.map((draft, index) => <DraftEditor key={index} draft={draft} index={index} sections={sections} projects={activeProjects} stages={stages} employees={employees} onChange={(itemIndex, value) => updateDraft(setMeetingDrafts, itemIndex, value)} onRemove={(itemIndex) => setMeetingDrafts((items) => items.filter((_, currentIndex) => currentIndex !== itemIndex))} />)}</div><button type="button" onClick={() => confirmDrafts(meetingDrafts, () => setMeetingDrafts([]))} className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white"><CheckCircle2 className="mr-2 h-5 w-5" />Создать выбранные задачи</button></section>}

      {meetingTranscript && <details className="rounded-3xl border bg-white p-5 shadow-sm"><summary className="cursor-pointer font-semibold text-slate-700"><FileAudio className="mr-2 inline h-4 w-4" />Полная расшифровка встречи</summary><textarea readOnly value={meetingTranscript} rows="14" className="mt-3 w-full rounded-2xl border bg-slate-50 px-3 py-2 text-sm" /></details>}
    </div>
  );
}
