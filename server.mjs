import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 10000);
const VIBECODE_API_KEY = process.env.VIBECODE_API_KEY || '';
const VIBECODE_BASE_URL = (process.env.VIBECODE_BASE_URL || 'https://vibecode.bitrix24.tech/v1').replace(/\/$/, '');
const VIBECODE_MODEL = process.env.VIBECODE_MODEL || 'bitrix/bitrixgpt-5.5';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
const DB_PING_CACHE_MS = Number(process.env.DB_PING_CACHE_MS || 4 * 60 * 1000);
let dbPingCache = { checkedAt: 0, status: 503, body: null };
const MAX_AUDIO_BYTES = Number(process.env.MAX_AUDIO_BYTES || 200 * 1024 * 1024);
const AI_ALLOWED_ORIGIN = String(process.env.AI_ALLOWED_ORIGIN || '').replace(/\/$/, '');
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = Number(process.env.AI_RATE_LIMIT_PER_HOUR || 120);
const rateBuckets = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '3mb' }));

// Render health check must verify only that this Node service is alive.
// It must NOT depend on Supabase, Bitrix VibeCode, or any external API.
app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'mavis-task-tracker', version: '6.2.5' });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
});


function aiRequestGuard(req, res, next) {
  const origin = String(req.get('origin') || '').replace(/\/$/, '');
  if (AI_ALLOWED_ORIGIN && origin && origin !== AI_ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'Запрос к ИИ отклонён: недопустимый источник.' });
  }
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= RATE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Слишком много запросов к ИИ. Повторите позже.' });
  }
  current.count += 1;
  next();
}

function ensureConfigured(_req, res, next) {
  if (!VIBECODE_API_KEY) {
    return res.status(503).json({
      error: 'VIBECODE_API_KEY не задан в Render Environment.',
      code: 'vibecode_not_configured',
    });
  }
  next();
}

function cleanJsonText(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractApiError(payload, status) {
  return payload?.error?.message || payload?.error?.code || payload?.message || `Vibe API вернул HTTP ${status}`;
}

async function vibeFetch(endpoint, options = {}) {
  const response = await fetch(`${VIBECODE_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'X-Api-Key': VIBECODE_API_KEY,
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(extractApiError(payload, response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function chatJson({ system, user, temperature = 0.1 }) {
  const payload = await vibeFetch('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VIBECODE_MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Модель не вернула содержимое ответа.');
  try {
    return JSON.parse(cleanJsonText(content));
  } catch (error) {
    const parseError = new Error(`Не удалось разобрать JSON от модели: ${error.message}`);
    parseError.raw = content;
    throw parseError;
  }
}

function normalizeContext(raw = {}) {
  const trim = (value, max = 800) => String(value || '').trim().slice(0, max);
  return {
    today: trim(raw.today, 32),
    timezone: trim(raw.timezone, 64) || 'Europe/Minsk',
    currentEmployee: raw.currentEmployee ? {
      name: trim(raw.currentEmployee.name, 120),
      role: trim(raw.currentEmployee.role, 200),
    } : null,
    sections: Array.isArray(raw.sections) ? raw.sections.slice(0, 100).map((item) => ({
      id: trim(item.id, 120),
      name: trim(item.name, 200),
      description: trim(item.description, 500),
    })) : [],
    projects: Array.isArray(raw.projects) ? raw.projects.slice(0, 500).map((item) => ({
      id: trim(item.id, 120),
      name: trim(item.name, 260),
      description: trim(item.description, 700),
      section_id: trim(item.section_id, 120) || null,
      owner: trim(item.owner, 120),
      customer: trim(item.customer, 200),
      status: trim(item.status, 80),
    })) : [],
    stages: Array.isArray(raw.stages) ? raw.stages.slice(0, 1500).map((item) => ({
      id: trim(item.id, 120),
      project_id: trim(item.project_id, 120),
      title: trim(item.title, 240),
      description: trim(item.description, 400),
    })) : [],
    employees: Array.isArray(raw.employees) ? raw.employees.slice(0, 200).map((item) => ({
      id: trim(item.id, 120),
      name: trim(item.name, 120),
      role: trim(item.role, 220),
    })) : [],
  };
}

const STRUCTURE_SYSTEM = `Ты — диспетчер задач внутреннего проектного приложения MAVIS GROUP.\nТвоя задача — преобразовать русскую голосовую расшифровку в ОДИН черновик задачи.\nИспользуй только существующие IDs из переданного контекста. Никогда не выдумывай project_id, section_id, stage_id или сотрудника.\nЕсли пользователь назвал проект — выбери его по точному или наиболее близкому смыслу. Если раздел не назван, определи раздел через выбранный проект; если проект не определён, выбери существующий раздел по смыслу.\nЕсли этап не назван или нет уверенности — stage_id=null. Задача может находиться прямо в проекте без этапа.\nОтносительные даты считай от context.today в timezone context.timezone. Если дедлайн не указан — установи ближайший разумный рабочий день и добавь предупреждение.\nОтветственный должен быть только из context.employees. Если явно не назван — используй текущего сотрудника, если он есть.\nНе создавай новые проекты или разделы.\nВерни строго JSON-объект вида:\n{\n  "transcript_summary":"краткое понимание поручения",\n  "task":{\n    "title":"конкретное действие",\n    "owner":"точное имя сотрудника",\n    "deadline":"YYYY-MM-DD",\n    "status":"Новая",\n    "priority":"Низкий|Средний|Высокий",\n    "project_id":null,\n    "section_id":null,\n    "stage_id":null,\n    "result":"измеримый результат",\n    "comment":"важные детали из поручения",\n    "confidence":0.0,\n    "warnings":[]\n  }\n}`;

const MEETING_SYSTEM = `Ты — секретарь проектной встречи MAVIS GROUP.\nИз полной русской расшифровки встречи выдели только реальные договорённости и поручения, которые можно оформить как задачи.\nНе превращай обсуждения, идеи без решения и общие рассуждения в задачи.\nИспользуй только существующие IDs проектов, разделов и этапов из контекста. Не выдумывай сущности. Задача может быть привязана к проекту без этапа.\nОтветственный — только точное имя из списка сотрудников и только если он явно назначен или однозначно следует из формулировки. Если неясно — owner пустая строка и warning.\nДедлайны преобразуй в YYYY-MM-DD относительно context.today. Если срок не назван — оставь deadline пустым и добавь warning.\nРаздел без проекта выбирай только при высокой уверенности.\nВерни строго JSON:\n{\n  "meeting_summary":"краткий итог встречи",\n  "decisions":["решение 1"],\n  "tasks":[{\n    "title":"конкретное поручение",\n    "owner":"",\n    "deadline":"",\n    "status":"Новая",\n    "priority":"Низкий|Средний|Высокий",\n    "project_id":null,\n    "section_id":null,\n    "stage_id":null,\n    "result":"ожидаемый результат",\n    "comment":"контекст поручения",\n    "evidence":"короткий фрагмент/пересказ основания из встречи",\n    "confidence":0.0,\n    "warnings":[]\n  }]\n}\nМаксимум 100 задач. Не дублируй одинаковые поручения.`;


// Lightweight Supabase keep-alive + availability check.
// Intended for an external uptime monitor. It performs a real, read-only
// PostgREST query so Supabase receives database activity, but caches the
// result briefly to prevent accidental request storms.
app.get('/api/db-ping', async (_req, res) => {
  const now = Date.now();
  if (dbPingCache.body && now - dbPingCache.checkedAt < DB_PING_CACHE_MS) {
    return res.status(dbPingCache.status).json({ ...dbPingCache.body, cached: true });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const body = {
      ok: false,
      service: 'mavis-task-tracker',
      database: 'supabase',
      code: 'supabase_not_configured',
      error: 'VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY не заданы в Render Environment.',
      checkedAt: new Date().toISOString(),
    };
    dbPingCache = { checkedAt: now, status: 503, body };
    return res.status(503).json(body);
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      const body = {
        ok: false,
        service: 'mavis-task-tracker',
        database: 'supabase',
        code: 'supabase_query_failed',
        upstreamStatus: response.status,
        error: details || `Supabase вернул HTTP ${response.status}`,
        checkedAt: new Date().toISOString(),
      };
      dbPingCache = { checkedAt: now, status: 503, body };
      return res.status(503).json(body);
    }

    // Consume the response to complete the PostgREST request.
    await response.json();
    const body = {
      ok: true,
      service: 'mavis-task-tracker',
      database: 'supabase',
      version: '6.2.5',
      checkedAt: new Date().toISOString(),
    };
    dbPingCache = { checkedAt: now, status: 200, body };
    return res.status(200).json(body);
  } catch (error) {
    const body = {
      ok: false,
      service: 'mavis-task-tracker',
      database: 'supabase',
      code: 'supabase_unreachable',
      error: error?.name === 'TimeoutError' ? 'Supabase не ответил за 12 секунд.' : String(error?.message || error),
      checkedAt: new Date().toISOString(),
    };
    dbPingCache = { checkedAt: now, status: 503, body };
    return res.status(503).json(body);
  }
});

app.get('/api/ai/health', async (_req, res) => {
  if (!VIBECODE_API_KEY) return res.status(503).json({ configured: false, model: VIBECODE_MODEL });
  try {
    const models = await vibeFetch('/models');
    const list = Array.isArray(models?.data) ? models.data : [];
    res.json({ configured: true, model: VIBECODE_MODEL, modelAvailable: list.some((item) => item.id === VIBECODE_MODEL) });
  } catch (error) {
    res.status(error.status || 502).json({ configured: true, model: VIBECODE_MODEL, error: error.message });
  }
});

app.post('/api/ai/transcribe', ensureConfigured, aiRequestGuard, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) return res.status(400).json({ error: 'Аудиофайл не передан.' });
    const form = new FormData();
    const filename = req.file.originalname || 'recording.webm';
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), filename);
    form.append('language', String(req.body.language || 'ru'));
    form.append('response_format', 'json');
    const result = await vibeFetch('/audio/transcriptions', { method: 'POST', body: form });
    res.json({ text: String(result?.text || '').trim() });
  } catch (error) {
    console.error('transcription error', error);
    res.status(error.status || 502).json({ error: error.message, details: error.payload || null });
  }
});

app.post('/api/ai/structure-task', ensureConfigured, aiRequestGuard, async (req, res) => {
  try {
    const transcript = String(req.body?.transcript || '').trim();
    if (!transcript) return res.status(400).json({ error: 'Расшифровка пустая.' });
    const context = normalizeContext(req.body?.context || {});
    const result = await chatJson({
      system: STRUCTURE_SYSTEM,
      user: JSON.stringify({ context, transcript }),
    });
    res.json(result);
  } catch (error) {
    console.error('structure-task error', error);
    res.status(error.status || 502).json({ error: error.message, raw: error.raw || null, details: error.payload || null });
  }
});

app.post('/api/ai/extract-meeting-tasks', ensureConfigured, aiRequestGuard, async (req, res) => {
  try {
    const transcript = String(req.body?.transcript || '').trim();
    if (!transcript) return res.status(400).json({ error: 'Расшифровка встречи пустая.' });
    if (transcript.length > 900000) return res.status(413).json({ error: 'Расшифровка слишком большая. Разделите встречу на две части.' });
    const context = normalizeContext(req.body?.context || {});
    const result = await chatJson({
      system: MEETING_SYSTEM,
      user: JSON.stringify({ context, transcript }),
    });
    res.json(result);
  } catch (error) {
    console.error('meeting extraction error', error);
    res.status(error.status || 502).json({ error: error.message, raw: error.raw || null, details: error.payload || null });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.use((error, _req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Аудиофайл больше допустимого лимита ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} МБ.` });
  console.error(error);
  res.status(500).json({ error: error?.message || 'Внутренняя ошибка сервера.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`MAVIS Task Tracker + AI listening on port ${port}`);
});
