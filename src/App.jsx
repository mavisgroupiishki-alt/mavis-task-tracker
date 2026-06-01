import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  CalendarDays,
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  X,
  RefreshCw,
  Upload,
  Trash2,
  Database,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const STORAGE_KEY = 'mavis_task_tracker_local_backup';

const team = [
  'Виктория',
  'РОП',
  'Руководитель экспертного отдела',
  'Маркетинг',
  'Эксперт 1',
  'Эксперт 2',
  'Менеджер 1',
  'Менеджер 2',
];

const statuses = ['Новая', 'В работе', 'На проверке', 'Готово'];
const priorities = ['Низкий', 'Средний', 'Высокий'];
const periods = ['day', 'week', 'month'];

const demoTasks = [
  {
    id: 'demo-1',
    title: 'Проверить зависшие сделки и отправить клиентам ход работы',
    owner: 'Руководитель экспертного отдела',
    deadline: '2026-06-03',
    period: 'day',
    status: 'В работе',
    priority: 'Высокий',
    hours: 3,
    result: 'По всем активным клиентам отправлен актуальный ход работы',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    title: 'Собрать план продаж на месяц по менеджерам',
    owner: 'РОП',
    deadline: '2026-06-05',
    period: 'week',
    status: 'Новая',
    priority: 'Средний',
    hours: 2,
    result: 'План разложен по источникам, неделям и менеджерам',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    title: 'Запустить найм эксперта в экспертный отдел',
    owner: 'Виктория',
    deadline: '2026-06-20',
    period: 'month',
    status: 'В работе',
    priority: 'Высокий',
    hours: 8,
    result: '1 эксперт вышел на испытательный срок',
    created_at: new Date().toISOString(),
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
  const next = new Date(dateIso);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function getMonthBounds(dateIso) {
  const date = new Date(dateIso);
  const first = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { first, last };
}

function isWithinRange(dateIso, startIso, endIso) {
  return dateIso >= startIso && dateIso <= endIso;
}

function statusStyle(status) {
  if (status === 'Готово') return 'bg-emerald-100 text-emerald-700';
  if (status === 'В работе') return 'bg-blue-100 text-blue-700';
  if (status === 'На проверке') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function priorityStyle(priority) {
  if (priority === 'Высокий') return 'bg-red-100 text-red-700';
  if (priority === 'Средний') return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-slate-600';
}

function emptyForm(selectedDate, selectedEmployee, view) {
  return {
    title: '',
    owner: selectedEmployee !== 'Все' ? selectedEmployee : team[0],
    deadline: selectedDate,
    period: view === 'all' ? 'day' : view,
    status: 'Новая',
    priority: 'Средний',
    hours: 1,
    result: '',
  };
}

function normalizeTask(task) {
  return {
    id: task.id,
    title: task.title || 'Без названия',
    owner: task.owner || team[0],
    deadline: task.deadline || todayIso(),
    period: periods.includes(task.period) ? task.period : 'day',
    status: statuses.includes(task.status) ? task.status : 'Новая',
    priority: priorities.includes(task.priority) ? task.priority : 'Средний',
    hours: Number(task.hours || 1),
    result: task.result || '',
    created_at: task.created_at || new Date().toISOString(),
  };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function getRowValue(row, names, fallback = '') {
  for (const name of names) {
    const key = Object.keys(row).find((item) => item.toLowerCase().trim() === name.toLowerCase().trim());
    if (key && row[key]) return row[key];
  }
  return fallback;
}

function normalizeCsvTask(row, index) {
  const rawPeriod = getRowValue(row, ['period', 'период'], 'day').toLowerCase();
  let period = rawPeriod;
  if (rawPeriod.includes('д')) period = 'day';
  if (rawPeriod.includes('нед')) period = 'week';
  if (rawPeriod.includes('мес')) period = 'month';

  return normalizeTask({
    id: `import-${Date.now()}-${index}`,
    title: getRowValue(row, ['title', 'задача', 'название', 'название задачи'], 'Без названия'),
    owner: getRowValue(row, ['owner', 'ответственный', 'сотрудник'], team[0]),
    deadline: getRowValue(row, ['deadline', 'срок', 'дата'], todayIso()),
    period,
    status: getRowValue(row, ['status', 'статус'], 'Новая'),
    priority: getRowValue(row, ['priority', 'приоритет'], 'Средний'),
    hours: Number(String(getRowValue(row, ['hours', 'часы', 'загрузка'], '1')).replace(',', '.')),
    result: getRowValue(row, ['result', 'результат', 'измеримый результат'], ''),
    created_at: new Date().toISOString(),
  });
}

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl bg-white shadow-sm ${className}`}>{children}</div>;
}

function Metric({ icon: Icon, label, value }) {
  return (
    <Card>
      <div className="p-4">
        <Icon className="mb-2 h-5 w-5 text-slate-500" />
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </Card>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('day');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedEmployee, setSelectedEmployee] = useState('Все');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm(todayIso(), 'Все', 'day'));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadTasks() {
    setLoading(true);
    setMessage('');

    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('deadline', { ascending: true })
          .order('created_at', { ascending: false });

        if (error) throw error;
        const normalized = (data || []).map(normalizeTask);
        setTasks(normalized);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        setMessage('Данные загружены из общей базы Supabase.');
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        const localTasks = saved ? JSON.parse(saved) : demoTasks;
        setTasks(localTasks.map(normalizeTask));
        setMessage('Локальный режим. Для общей работы команды подключите Supabase в Render.');
      }
    } catch (error) {
      const saved = localStorage.getItem(STORAGE_KEY);
      const fallback = saved ? JSON.parse(saved) : demoTasks;
      setTasks(fallback.map(normalizeTask));
      setMessage(`Не удалось загрузить базу. Открыта локальная копия. Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const viewRange = useMemo(() => {
    if (view === 'day') return { start: selectedDate, end: selectedDate };
    if (view === 'week') return { start: selectedDate, end: addDays(selectedDate, 6) };
    if (view === 'month') {
      const { first, last } = getMonthBounds(selectedDate);
      return { start: first, end: last };
    }
    return { start: '0000-01-01', end: '9999-12-31' };
  }, [view, selectedDate]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      const byPeriod = view === 'all' || isWithinRange(task.deadline, viewRange.start, viewRange.end);
      const byOwner = selectedEmployee === 'Все' || task.owner === selectedEmployee;
      const q = search.toLowerCase();
      const bySearch = `${task.title} ${task.owner} ${task.result}`.toLowerCase().includes(q);
      return byPeriod && byOwner && bySearch;
    });
  }, [tasks, view, viewRange, selectedEmployee, search]);

  const tasksForWorkload = useMemo(() => {
    return tasks.filter((task) => view === 'all' || isWithinRange(task.deadline, viewRange.start, viewRange.end));
  }, [tasks, view, viewRange]);

  const workload = useMemo(() => {
    return team.map((person) => {
      const personTasks = tasksForWorkload.filter((task) => task.owner === person);
      const hours = personTasks.reduce((sum, task) => sum + Number(task.hours || 0), 0);
      const done = personTasks.filter((task) => task.status === 'Готово').length;
      const overdue = personTasks.filter((task) => task.deadline < todayIso() && task.status !== 'Готово').length;
      return {
        name: person.length > 16 ? `${person.slice(0, 16)}…` : person,
        fullName: person,
        hours,
        tasks: personTasks.length,
        done,
        overdue,
      };
    });
  }, [tasksForWorkload]);

  const summary = useMemo(() => {
    return {
      total: tasksForWorkload.length,
      inProgress: tasksForWorkload.filter((task) => task.status === 'В работе').length,
      review: tasksForWorkload.filter((task) => task.status === 'На проверке').length,
      done: tasksForWorkload.filter((task) => task.status === 'Готово').length,
      overdue: tasksForWorkload.filter((task) => task.deadline < todayIso() && task.status !== 'Готово').length,
      hours: tasksForWorkload.reduce((sum, task) => sum + Number(task.hours || 0), 0),
    };
  }, [tasksForWorkload]);

  function openModal() {
    setForm(emptyForm(selectedDate, selectedEmployee, view));
    setIsModalOpen(true);
  }

  async function addTask() {
    if (!form.title.trim()) {
      setMessage('Введите название задачи.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      owner: form.owner,
      deadline: form.deadline,
      period: form.period,
      status: form.status,
      priority: form.priority,
      hours: Number(form.hours || 1),
      result: form.result.trim(),
    };

    try {
      if (supabase) {
        const { data, error } = await supabase.from('tasks').insert(payload).select().single();
        if (error) throw error;
        setTasks((prev) => [normalizeTask(data), ...prev]);
        setMessage('Задача сохранена в общей базе.');
      } else {
        setTasks((prev) => [normalizeTask({ ...payload, id: `local-${Date.now()}` }), ...prev]);
        setMessage('Задача сохранена локально.');
      }
      setIsModalOpen(false);
      setForm(emptyForm(selectedDate, selectedEmployee, view));
    } catch (error) {
      setMessage(`Не удалось сохранить задачу: ${error.message}`);
    }
  }

  async function updateStatus(id, status) {
    const previous = tasks;
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, status } : task)));

    try {
      if (supabase && !String(id).startsWith('local') && !String(id).startsWith('demo') && !String(id).startsWith('import')) {
        const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
        if (error) throw error;
      }
    } catch (error) {
      setTasks(previous);
      setMessage(`Не удалось обновить статус: ${error.message}`);
    }
  }

  async function deleteTask(id) {
    const previous = tasks;
    setTasks((prev) => prev.filter((task) => task.id !== id));

    try {
      if (supabase && !String(id).startsWith('local') && !String(id).startsWith('demo') && !String(id).startsWith('import')) {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (error) throw error;
      }
      setMessage('Задача удалена.');
    } catch (error) {
      setTasks(previous);
      setMessage(`Не удалось удалить задачу: ${error.message}`);
    }
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      setMessage('В CSV нет задач для импорта.');
      return;
    }

    const headers = parseCsvLine(lines[0]);
    const imported = lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, headerIndex) => {
        row[header] = values[headerIndex] || '';
      });
      return normalizeCsvTask(row, index);
    });

    try {
      if (supabase) {
        const payload = imported.map(({ id, created_at, ...task }) => task);
        const { data, error } = await supabase.from('tasks').insert(payload).select();
        if (error) throw error;
        setTasks((prev) => [...(data || []).map(normalizeTask), ...prev]);
      } else {
        setTasks((prev) => [...imported, ...prev]);
      }
      setMessage(`Импортировано задач: ${imported.length}.`);
      event.target.value = '';
    } catch (error) {
      setMessage(`Не удалось импортировать CSV: ${error.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p className="text-sm text-slate-500">MAVIS GROUP · трекинг задач</p>
            <h1 className="text-3xl font-bold tracking-tight">Задачи команды</h1>
            <p className="mt-1 text-slate-600">
              День, неделя, месяц, загрузка сотрудников, импорт из Google-таблицы и быстрый ввод задач.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border bg-white px-5 py-3 text-sm shadow-sm hover:bg-slate-50">
              <Upload className="mr-2 h-4 w-4" /> Импорт CSV
              <input type="file" accept=".csv" onChange={importCsv} className="hidden" />
            </label>
            <button
              type="button"
              onClick={loadTasks}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-2xl border bg-white px-5 py-3 text-sm shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить
            </button>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              <Plus className="mr-2 h-4 w-4" /> Добавить задачу
            </button>
          </div>
        </motion.div>

        {message && (
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">
            <Database className="mr-2 inline h-4 w-4" /> {message}
          </div>
        )}

        <Card>
          <div className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex rounded-2xl bg-slate-100 p-1">
                  {[
                    ['day', 'День'],
                    ['week', 'Неделя'],
                    ['month', 'Месяц'],
                    ['all', 'Все'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setView(key)}
                      className={`rounded-xl px-4 py-2 text-sm transition ${view === key ? 'bg-white shadow-sm' : 'text-slate-600'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {view !== 'all' && (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="rounded-2xl border bg-white px-3 py-2 text-sm md:w-44"
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Поиск задачи"
                    className="w-full rounded-2xl border bg-white py-2 pl-9 pr-3 text-sm md:w-64"
                  />
                </div>
                <select
                  value={selectedEmployee}
                  onChange={(event) => setSelectedEmployee(event.target.value)}
                  className="rounded-2xl border bg-white px-3 py-2 text-sm"
                >
                  <option>Все</option>
                  {team.map((person) => (
                    <option key={person}>{person}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Период: {view === 'all' ? 'все задачи' : `${viewRange.start} — ${viewRange.end}`}
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Metric icon={CalendarDays} label="Всего задач" value={summary.total} />
          <Metric icon={Clock} label="В работе" value={summary.inProgress} />
          <Metric icon={AlertCircle} label="На проверке" value={summary.review} />
          <Metric icon={CheckCircle2} label="Готово" value={summary.done} />
          <Metric icon={AlertCircle} label="Просрочено" value={summary.overdue} />
          <Metric icon={Users} label="Часов" value={summary.hours} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card>
            <div className="p-5">
              <h2 className="flex items-center text-xl font-semibold">
                <BarChart3 className="mr-2 h-5 w-5" /> График загрузки
              </h2>
              <p className="mb-5 text-sm text-slate-500">По количеству часов на выбранный период.</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={workload}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value) => [`${value} ч`, 'Загрузка']} />
                    <Bar dataKey="hours" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <h2 className="text-xl font-semibold">Загрузка по сотрудникам</h2>
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setSelectedEmployee('Все')}
                  className={`w-full rounded-2xl border p-4 text-left ${selectedEmployee === 'Все' ? 'bg-slate-900 text-white' : 'bg-white'}`}
                >
                  Все сотрудники
                </button>
                {workload.map((item) => (
                  <button
                    key={item.fullName}
                    type="button"
                    onClick={() => setSelectedEmployee(item.fullName)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedEmployee === item.fullName ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{item.fullName}</p>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{item.hours} ч</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-slate-400" style={{ width: `${Math.min(item.hours * 10, 100)}%` }} />
                    </div>
                    <p className={`mt-2 text-sm ${selectedEmployee === item.fullName ? 'text-white/75' : 'text-slate-500'}`}>
                      Задач: {item.tasks} · Готово: {item.done} · Просрочено: {item.overdue}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <div className="p-5">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Список задач</h2>
                <p className="text-sm text-slate-500">Задача, ответственный, срок, результат, часы.</p>
              </div>
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              >
                <Plus className="mr-2 h-4 w-4" /> Новая задача
              </button>
            </div>

            <div className="space-y-3">
              {visibleTasks.map((task) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border bg-white p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs ${statusStyle(task.status)}`}>{task.status}</span>
                        <span className={`rounded-full px-3 py-1 text-xs ${priorityStyle(task.priority)}`}>{task.priority}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                          {task.period === 'day' ? 'День' : task.period === 'week' ? 'Неделя' : 'Месяц'}
                        </span>
                        {task.deadline < todayIso() && task.status !== 'Готово' && (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">Просрочено</span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold">{task.title}</h3>
                      <p className="text-sm text-slate-600">
                        <b>Измеримый результат:</b> {task.result || 'Не указан'}
                      </p>
                      <p className="text-sm text-slate-500">
                        Ответственный: {task.owner} · Срок: {task.deadline} · Оценка: {task.hours} ч
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <select
                        value={task.status}
                        onChange={(event) => updateStatus(task.id, event.target.value)}
                        className="rounded-xl border bg-white px-3 py-2 text-sm"
                      >
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="inline-flex items-center rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Удалить
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {visibleTasks.length === 0 && (
                <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-500">
                  Задач по выбранным фильтрам нет.
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Новая задача</h2>
                <p className="text-sm text-slate-500">Заполняем только нужные поля.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-medium">Задача</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Например: проверить план задач на неделю"
                  className="w-full rounded-2xl border px-3 py-2"
                />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Ответственный</span>
                <select
                  value={form.owner}
                  onChange={(event) => setForm({ ...form, owner: event.target.value })}
                  className="w-full rounded-2xl border bg-white px-3 py-2"
                >
                  {team.map((person) => (
                    <option key={person}>{person}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Срок</span>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(event) => setForm({ ...form, deadline: event.target.value })}
                  className="w-full rounded-2xl border px-3 py-2"
                />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Период</span>
                <select
                  value={form.period}
                  onChange={(event) => setForm({ ...form, period: event.target.value })}
                  className="w-full rounded-2xl border bg-white px-3 py-2"
                >
                  <option value="day">День</option>
                  <option value="week">Неделя</option>
                  <option value="month">Месяц</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Приоритет</span>
                <select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className="w-full rounded-2xl border bg-white px-3 py-2"
                >
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Загрузка, часов</span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={form.hours}
                  onChange={(event) => setForm({ ...form, hours: event.target.value })}
                  className="w-full rounded-2xl border px-3 py-2"
                />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Статус</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                  className="w-full rounded-2xl border bg-white px-3 py-2"
                >
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-medium">Измеримый результат</span>
                <input
                  value={form.result}
                  onChange={(event) => setForm({ ...form, result: event.target.value })}
                  placeholder="Что должно быть готово по итогу"
                  className="w-full rounded-2xl border px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-2xl border px-5 py-3 text-sm hover:bg-slate-50">
                Отмена
              </button>
              <button type="button" onClick={addTask} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
                Сохранить задачу
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
