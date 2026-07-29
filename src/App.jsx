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
  ListChecks,
  UserPlus,
  Pencil,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Briefcase,
  Sparkles,
  UserMinus,
} from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const STORAGE_KEY = 'mavis_task_tracker_local_backup_v3';
const EMPLOYEES_STORAGE_KEY = 'mavis_task_tracker_employees_v1';

const DEFAULT_EMPLOYEES = [
  { id: 'default-sasha', name: 'Саша', role: 'Руководитель отдела продаж', color: '#7c3aed' },
  { id: 'default-tanya', name: 'Таня', role: 'Руководитель экспертного отдела', color: '#0284c7' },
  { id: 'default-anya', name: 'Аня', role: 'Проекты и автоматизация', color: '#ea580c' },
  { id: 'default-victoria', name: 'Виктория', role: 'Директор', color: '#059669' },
];
const EMPLOYEE_COLORS = ['#7c3aed', '#0284c7', '#ea580c', '#059669', '#db2777', '#4f46e5', '#0891b2', '#ca8a04'];
const statuses = ['Новая', 'В работе', 'На проверке', 'Готово'];
const priorities = ['Низкий', 'Средний', 'Высокий'];
const periods = ['day', 'week', 'month'];
const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const shortDayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const ruWeekdayWords = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

const demoTasks = [
  {
    id: 'demo-1',
    title: 'Подготовить стажировки и материалы',
    owner: 'Саша',
    deadline: todayIso(),
    period: 'day',
    status: 'В работе',
    priority: 'Высокий',
    hours: 3,
    start_time: '10:00',
    end_time: '13:00',
    block: 'Найм',
    result: 'Материалы и порядок сопровождения стажеров подготовлены',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    title: 'Weekly Таня / Виктория',
    owner: 'Виктория',
    deadline: addDays(todayIso(), 2),
    period: 'week',
    status: 'Новая',
    priority: 'Средний',
    hours: 1,
    start_time: '11:00',
    end_time: '12:00',
    block: 'Встреча',
    result: 'Договоренности и следующие шаги зафиксированы',
    created_at: new Date().toISOString(),
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
  const next = new Date(`${dateIso}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function getWeekStart(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getMonthBounds(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
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

function emptyForm(selectedDate, selectedEmployee, view, employeeNames = DEFAULT_EMPLOYEES.map((employee) => employee.name)) {
  return {
    title: '',
    owner: selectedEmployee !== 'Все' ? selectedEmployee : employeeNames[0] || 'Саша',
    deadline: selectedDate,
    period: view === 'all' ? 'day' : view,
    status: 'Новая',
    priority: 'Средний',
    hours: 1,
    start_time: '09:00',
    end_time: '10:00',
    block: '',
    result: '',
  };
}

function normalizeTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour = String(Math.min(23, Number(match[1]))).padStart(2, '0');
  const minute = String(Math.min(59, Number(match[2]))).padStart(2, '0');
  return `${hour}:${minute}`;
}

function toMinutes(value) {
  const time = normalizeTime(value);
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function hoursBetween(start, end) {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin == null || endMin == null || endMin <= startMin) return null;
  return Math.round(((endMin - startMin) / 60) * 100) / 100;
}

function formatTime(value) {
  const time = normalizeTime(value);
  return time || 'без времени';
}

function normalizeOwner(owner) {
  const cleanOwner = String(owner || '').trim();
  if (cleanOwner === 'Алиса') return 'Саша';
  return cleanOwner || 'Саша';
}

function normalizeTask(task) {
  const start = normalizeTime(task.start_time || task.startTime || '');
  const end = normalizeTime(task.end_time || task.endTime || '');
  const calculatedHours = hoursBetween(start, end);
  return {
    id: task.id,
    title: task.title || 'Без названия',
    owner: normalizeOwner(task.owner || 'Саша'),
    deadline: task.deadline || todayIso(),
    period: periods.includes(task.period) ? task.period : 'day',
    status: statuses.includes(task.status) ? task.status : 'Новая',
    priority: priorities.includes(task.priority) ? task.priority : 'Средний',
    hours: Number(task.hours ?? calculatedHours ?? 1),
    start_time: start,
    end_time: end,
    block: task.block || '',
    result: task.result || '',
    created_at: task.created_at || new Date().toISOString(),
  };
}

function isDayHeader(value) {
  const text = String(value || '').trim().toLowerCase();
  return ruWeekdayWords.some((day) => text.includes(day));
}

function dateToIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function excelDateToIso(value, XLSX, defaultYear) {
  if (value == null || value === '') return '';

  if (value instanceof Date) return dateToIso(value);

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = String(value).trim();
  const isoMatch = text.match(/(20\d{2})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`;

  const ruMatch = text.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](20\d{2}))?/);
  if (ruMatch) {
    const year = ruMatch[3] || defaultYear;
    return `${year}-${String(ruMatch[2]).padStart(2, '0')}-${String(ruMatch[1]).padStart(2, '0')}`;
  }

  return '';
}

function normalizeOneTime(hour, minute, marker) {
  let h = Number(hour);
  const m = Number(minute || 0);
  const ampm = String(marker || '').toLowerCase();
  if (ampm.includes('p') && h < 12) h += 12;
  if (ampm.includes('a') && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeRange(value) {
  const text = String(value || '').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
  if (!text) return { start_time: '', end_time: '' };

  const matches = [...text.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?/g)];
  if (!matches.length) return { start_time: '', end_time: '' };

  const start = normalizeOneTime(matches[0][1], matches[0][2], matches[0][3]);
  let end = '';
  if (matches[1]) {
    end = normalizeOneTime(matches[1][1], matches[1][2], matches[1][3] || matches[0][3]);
  }

  if (!end) {
    const startMin = toMinutes(start) || 0;
    const endMin = Math.min(startMin + 60, 23 * 60 + 59);
    end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  }

  return { start_time: start, end_time: end };
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
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return fallback;
}

function normalizeCsvTask(row, index, defaultOwner) {
  const rawPeriod = String(getRowValue(row, ['period', 'период'], 'day')).toLowerCase();
  let period = rawPeriod;
  if (rawPeriod.includes('д')) period = 'day';
  if (rawPeriod.includes('нед')) period = 'week';
  if (rawPeriod.includes('мес')) period = 'month';

  const timeRange = parseTimeRange(getRowValue(row, ['время', 'time'], ''));
  const startTime = normalizeTime(getRowValue(row, ['start_time', 'начало', 'старт'], timeRange.start_time));
  const endTime = normalizeTime(getRowValue(row, ['end_time', 'конец', 'окончание'], timeRange.end_time));
  const calculatedHours = hoursBetween(startTime, endTime);

  return normalizeTask({
    id: `import-${Date.now()}-${index}`,
    title: getRowValue(row, ['title', 'задача', 'название', 'название задачи'], 'Без названия'),
    owner: getRowValue(row, ['owner', 'ответственный', 'сотрудник', 'участник'], defaultOwner),
    deadline: getRowValue(row, ['deadline', 'срок', 'дата'], todayIso()),
    period,
    status: getRowValue(row, ['status', 'статус'], 'Новая'),
    priority: getRowValue(row, ['priority', 'приоритет'], 'Средний'),
    hours: Number(String(getRowValue(row, ['hours', 'часы', 'загрузка'], calculatedHours || '1')).replace(',', '.')),
    start_time: startTime,
    end_time: endTime,
    block: getRowValue(row, ['block', 'блок'], ''),
    result: getRowValue(row, ['result', 'результат', 'измеримый результат'], ''),
    created_at: new Date().toISOString(),
  });
}

function isZeroWorkBlock(block, title) {
  const text = `${block} ${title}`.toLowerCase();
  return text.includes('перерыв') || text.includes('свободный слот') || text.includes('резерв');
}

function detectOwnerFromText(text, defaultOwner, employeeNames) {
  const lower = String(text || '').toLowerCase();
  const found = employeeNames.find((person) => lower.includes(person.toLowerCase()));
  return found || defaultOwner;
}

function parseScheduleWorkbook(workbook, XLSX, importOwner, defaultYear, employeeNames) {
  const imported = [];
  const seen = new Set();

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];

      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        if (!isDayHeader(row[colIndex])) continue;

        const deadline = excelDateToIso(row[colIndex + 1], XLSX, defaultYear) || excelDateToIso(row[colIndex], XLSX, defaultYear);
        if (!deadline) continue;

        let nextHeaderRow = rows.length;
        for (let scanRow = rowIndex + 1; scanRow < rows.length; scanRow += 1) {
          if (isDayHeader((rows[scanRow] || [])[colIndex])) {
            nextHeaderRow = scanRow;
            break;
          }
        }

        for (let taskRowIndex = rowIndex + 2; taskRowIndex < nextHeaderRow; taskRowIndex += 1) {
          const taskRow = rows[taskRowIndex] || [];
          const timeText = taskRow[colIndex];
          const block = String(taskRow[colIndex + 1] || '').trim();
          const title = String(taskRow[colIndex + 2] || '').trim();
          const result = String(taskRow[colIndex + 3] || '').trim();

          if (!timeText || !title || title === '—' || String(timeText).toLowerCase().includes('время')) continue;

          const { start_time: startTime, end_time: endTime } = parseTimeRange(timeText);
          const calculatedHours = hoursBetween(startTime, endTime) || 1;
          const key = `${sheetName}|${deadline}|${startTime}|${endTime}|${block}|${title}`;
          if (seen.has(key)) continue;
          seen.add(key);

          imported.push(
            normalizeTask({
              id: `xlsx-${Date.now()}-${imported.length}`,
              title,
              owner: detectOwnerFromText(`${title} ${block} ${result}`, importOwner, employeeNames),
              deadline,
              period: 'day',
              status: 'Новая',
              priority: 'Средний',
              hours: isZeroWorkBlock(block, title) ? 0 : calculatedHours,
              start_time: startTime,
              end_time: endTime,
              block,
              result: result === '—' ? '' : result,
              created_at: new Date().toISOString(),
            })
          );
        }
      }
    }
  });

  return imported;
}

function employeeInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '—';
}

function Card({ children, className = '' }) {
  return <div className={`rounded-3xl border border-white/70 bg-white/90 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur ${className}`}>{children}</div>;
}

function Metric({ icon: Icon, label, value, tone = 'violet' }) {
  const tones = {
    violet: 'from-violet-500/15 to-fuchsia-500/5 text-violet-700 ring-violet-100',
    blue: 'from-sky-500/15 to-cyan-500/5 text-sky-700 ring-sky-100',
    amber: 'from-amber-500/20 to-orange-500/5 text-amber-700 ring-amber-100',
    emerald: 'from-emerald-500/15 to-teal-500/5 text-emerald-700 ring-emerald-100',
    rose: 'from-rose-500/15 to-red-500/5 text-rose-700 ring-rose-100',
    indigo: 'from-indigo-500/15 to-violet-500/5 text-indigo-700 ring-indigo-100',
  };
  return (
    <div className={`rounded-3xl bg-gradient-to-br p-4 ring-1 ${tones[tone] || tones.violet}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <span className="rounded-2xl bg-white/80 p-2.5 shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function CalendarTask({ task, compact = false, onEdit }) {
  return (
    <button
      type="button"
      onClick={() => onEdit?.(task)}
      className="block w-full rounded-xl border border-white/30 p-2 text-left text-white shadow-sm transition hover:brightness-105"
      style={{ backgroundColor: task.color || '#0284c7' }}
      title="Открыть задачу"
    >
      <div className="text-[11px] font-semibold leading-tight">
        {formatTime(task.start_time)}{task.end_time ? `–${formatTime(task.end_time)}` : ''}
      </div>
      <div className={`${compact ? 'text-xs' : 'text-sm'} mt-1 font-semibold leading-tight`}>{task.title}</div>
      {task.block && <div className="mt-1 text-[11px] text-white/80">{task.block}</div>}
      <div className="mt-1 text-[11px] text-white/80">{task.owner}</div>
    </button>
  );
}

function WeekCalendar({ tasks, selectedDate, view, onEdit }) {
  const start = view === 'day' ? selectedDate : getWeekStart(selectedDate);
  const days = view === 'day' ? [selectedDate] : Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const startHour = 8;
  const endHour = 19;
  const rowHeight = 44;
  const totalRows = (endHour - startHour) * 2;
  const gridHeight = totalRows * rowHeight;

  const timedTasks = tasks.filter((task) => task.start_time && task.end_time);
  const noTimeTasks = tasks.filter((task) => !task.start_time || !task.end_time);

  return (
    <Card>
      <div className="p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Календарь задач</h2>
            <p className="text-sm text-slate-500">Отображение задач по времени, как в Google Calendar.</p>
          </div>
          <div className="text-sm text-slate-500">
            {days[0]} {days.length > 1 ? `— ${days[days.length - 1]}` : ''}
          </div>
        </div>

        {noTimeTasks.length > 0 && (
          <div className="mb-4 rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">Без времени</p>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              {noTimeTasks.map((task) => (
                <CalendarTask key={task.id} task={task} compact onEdit={onEdit} />
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border bg-white">
          <div className="min-w-[860px]">
            <div className="grid border-b bg-slate-50" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(110px, 1fr))` }}>
              <div className="p-3 text-xs font-medium text-slate-500">Время</div>
              {days.map((day) => {
                const date = new Date(`${day}T00:00:00`);
                return (
                  <div key={day} className="border-l p-3 text-center">
                    <div className="text-xs uppercase text-slate-500">{shortDayNames[date.getDay()]}</div>
                    <div className="text-lg font-bold">{date.getDate()}</div>
                  </div>
                );
              })}
            </div>

            <div className="grid" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(110px, 1fr))` }}>
              <div className="relative bg-slate-50" style={{ height: gridHeight }}>
                {Array.from({ length: totalRows + 1 }, (_, index) => {
                  const minutes = startHour * 60 + index * 30;
                  const hour = Math.floor(minutes / 60);
                  const minute = minutes % 60;
                  return (
                    <div key={minutes} className="absolute left-0 right-0 border-t px-2 text-[11px] text-slate-500" style={{ top: index * rowHeight }}>
                      {minute === 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                    </div>
                  );
                })}
              </div>

              {days.map((day) => {
                const dayTasks = timedTasks.filter((task) => task.deadline === day);
                return (
                  <div key={day} className="relative border-l" style={{ height: gridHeight }}>
                    {Array.from({ length: totalRows + 1 }, (_, index) => (
                      <div key={index} className="absolute left-0 right-0 border-t" style={{ top: index * rowHeight }} />
                    ))}
                    {dayTasks.map((task) => {
                      const startMin = toMinutes(task.start_time) ?? startHour * 60;
                      const endMin = toMinutes(task.end_time) ?? startMin + 60;
                      const top = Math.max(0, ((startMin - startHour * 60) / 30) * rowHeight);
                      const height = Math.max(34, ((endMin - startMin) / 30) * rowHeight - 4);
                      return (
                        <div key={task.id} className="absolute left-1 right-1 z-10" style={{ top, height }}>
                          <CalendarTask task={task} compact onEdit={onEdit} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function MonthCalendar({ tasks, selectedDate, onEdit }) {
  const { first, last } = getMonthBounds(selectedDate);
  const monthStart = getWeekStart(first);
  const lastDate = new Date(`${last}T00:00:00`);
  const days = [];
  let cursor = monthStart;
  while (days.length < 42) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    if (cursor > last && new Date(`${cursor}T00:00:00`).getDay() === 1 && new Date(`${cursor}T00:00:00`) > lastDate) break;
  }

  const selectedMonth = new Date(`${selectedDate}T00:00:00`).getMonth();

  return (
    <Card>
      <div className="p-5">
        <h2 className="text-xl font-semibold">Календарь месяца</h2>
        <p className="mb-4 text-sm text-slate-500">Месячное отображение задач по дням.</p>
        <div className="grid grid-cols-7 overflow-hidden rounded-2xl border bg-white">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
            <div key={day} className="border-b bg-slate-50 p-2 text-center text-xs font-semibold text-slate-500">{day}</div>
          ))}
          {days.map((day) => {
            const date = new Date(`${day}T00:00:00`);
            const dayTasks = tasks.filter((task) => task.deadline === day).slice(0, 4);
            return (
              <div key={day} className={`min-h-32 border-b border-r p-2 ${date.getMonth() === selectedMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'}`}>
                <div className="mb-2 text-sm font-semibold">{date.getDate()}</div>
                <div className="space-y-1">
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onEdit?.(task)}
                      className="block w-full truncate rounded-lg px-2 py-1 text-left text-[11px] text-white transition hover:brightness-105"
                      style={{ backgroundColor: task.color || '#0284c7' }}
                      title="Открыть задачу"
                    >
                      {task.start_time ? `${formatTime(task.start_time)} ` : ''}{task.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function normalizeEmployee(employee, index = 0) {
  if (typeof employee === 'string') {
    return {
      id: `employee-${employee.toLowerCase().replace(/\s+/g, '-')}`,
      name: normalizeOwner(employee),
      role: 'Сотрудник',
      color: EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length],
    };
  }

  return {
    id: employee.id || `employee-${Date.now()}-${index}`,
    name: normalizeOwner(employee.name),
    role: String(employee.role || 'Сотрудник').trim() || 'Сотрудник',
    color: employee.color || EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length],
    created_at: employee.created_at,
  };
}

function mergeEmployees(baseEmployees, tasks) {
  const normalized = [];
  const names = new Set();

  baseEmployees.map(normalizeEmployee).forEach((employee) => {
    if (!names.has(employee.name)) {
      normalized.push(employee);
      names.add(employee.name);
    }
  });

  tasks.forEach((task) => {
    const owner = normalizeOwner(task.owner);
    if (!names.has(owner)) {
      normalized.push(normalizeEmployee({ name: owner, role: 'Сотрудник' }, normalized.length));
      names.add(owner);
    }
  });

  return normalized;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState(DEFAULT_EMPLOYEES);
  const [view, setView] = useState('week');
  const [displayMode, setDisplayMode] = useState('calendar');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedEmployee, setSelectedEmployee] = useState('Все');
  const [importOwner, setImportOwner] = useState(DEFAULT_EMPLOYEES[0].name);
  const [search, setSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [form, setForm] = useState(emptyForm(todayIso(), 'Все', 'week'));
  const [employeeForm, setEmployeeForm] = useState({ name: '', role: '', color: EMPLOYEE_COLORS[0] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const employeeNames = useMemo(() => employees.map((employee) => employee.name), [employees]);

  async function loadTasks() {
    setLoading(true);
    setMessage('');

    try {
      const savedEmployees = localStorage.getItem(EMPLOYEES_STORAGE_KEY);
      let loadedEmployees = savedEmployees
        ? JSON.parse(savedEmployees).map(normalizeEmployee)
        : DEFAULT_EMPLOYEES;

      if (supabase) {
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('*')
          .order('created_at', { ascending: true });

        if (!employeeError && employeeData?.length) {
          loadedEmployees = employeeData.map(normalizeEmployee);
        }

        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('deadline', { ascending: true })
          .order('start_time', { ascending: true })
          .order('created_at', { ascending: false });

        if (error) throw error;
        const normalized = (data || []).map(normalizeTask);
        const mergedEmployees = mergeEmployees(loadedEmployees, normalized);
        setTasks(normalized);
        setEmployees(mergedEmployees);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        localStorage.setItem(EMPLOYEES_STORAGE_KEY, JSON.stringify(mergedEmployees));
        setMessage(
          employeeError
            ? 'Задачи загружены из Supabase. Сотрудники пока хранятся локально — примените SQL-обновление из архива.'
            : 'Данные команды загружены из общей базы Supabase.'
        );
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        const localTasks = saved ? JSON.parse(saved) : demoTasks;
        const normalized = localTasks.map(normalizeTask);
        const mergedEmployees = mergeEmployees(loadedEmployees, normalized);
        setTasks(normalized);
        setEmployees(mergedEmployees);
        setMessage('Локальный режим. Изменения сохраняются в этом браузере.');
      }
    } catch (error) {
      const saved = localStorage.getItem(STORAGE_KEY);
      const fallback = saved ? JSON.parse(saved) : demoTasks;
      const normalized = fallback.map(normalizeTask);
      const savedEmployees = localStorage.getItem(EMPLOYEES_STORAGE_KEY);
      const fallbackEmployees = savedEmployees ? JSON.parse(savedEmployees) : DEFAULT_EMPLOYEES;
      setTasks(normalized);
      setEmployees(mergeEmployees(fallbackEmployees, normalized));
      setMessage(`Не удалось загрузить общую базу. Открыта локальная копия. Ошибка: ${error.message}`);
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

  useEffect(() => {
    localStorage.setItem(EMPLOYEES_STORAGE_KEY, JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    if (selectedEmployee !== 'Все' && !employeeNames.includes(selectedEmployee)) {
      setSelectedEmployee('Все');
    }
    if (!employeeNames.includes(importOwner) && employeeNames[0]) {
      setImportOwner(employeeNames[0]);
    }
  }, [employeeNames, selectedEmployee, importOwner]);

  const viewRange = useMemo(() => {
    if (view === 'day') return { start: selectedDate, end: selectedDate };
    if (view === 'week') {
      const start = getWeekStart(selectedDate);
      return { start, end: addDays(start, 6) };
    }
    if (view === 'month') {
      const { first, last } = getMonthBounds(selectedDate);
      return { start: first, end: last };
    }
    return { start: '0000-01-01', end: '9999-12-31' };
  }, [view, selectedDate]);

  const tasksForPeriod = useMemo(() => {
    return tasks.filter((task) => view === 'all' || isWithinRange(task.deadline, viewRange.start, viewRange.end));
  }, [tasks, view, viewRange]);

  const visibleTasks = useMemo(() => {
    return tasksForPeriod.filter((task) => {
      const byOwner = selectedEmployee === 'Все' || task.owner === selectedEmployee;
      const q = search.toLowerCase();
      const bySearch = `${task.title} ${task.owner} ${task.result} ${task.block}`.toLowerCase().includes(q);
      const byQuickFilter =
        taskFilter === 'all' ||
        (taskFilter === 'overdue' && task.deadline < todayIso() && task.status !== 'Готово') ||
        (taskFilter === 'today' && task.deadline === todayIso()) ||
        (taskFilter === 'active' && task.status !== 'Готово');
      return byOwner && bySearch && byQuickFilter;
    });
  }, [tasksForPeriod, selectedEmployee, search, taskFilter]);

  const calendarTasks = useMemo(() => {
    return visibleTasks.map((task) => ({
      ...task,
      color: employees.find((employee) => employee.name === task.owner)?.color || '#0284c7',
    }));
  }, [visibleTasks, employees]);

  const workload = useMemo(() => {
    return employees.map((employee) => {
      const personTasks = tasksForPeriod.filter((task) => task.owner === employee.name);
      const hours = personTasks.reduce((sum, task) => sum + Number(task.hours || 0), 0);
      const done = personTasks.filter((task) => task.status === 'Готово').length;
      const overdue = personTasks.filter((task) => task.deadline < todayIso() && task.status !== 'Готово').length;
      return {
        name: employee.name,
        fullName: employee.name,
        role: employee.role,
        color: employee.color,
        employeeId: employee.id,
        hours: Math.round(hours * 10) / 10,
        tasks: personTasks.length,
        done,
        overdue,
      };
    });
  }, [tasksForPeriod, employees]);

  const summary = useMemo(() => {
    return {
      total: tasksForPeriod.length,
      inProgress: tasksForPeriod.filter((task) => task.status === 'В работе').length,
      review: tasksForPeriod.filter((task) => task.status === 'На проверке').length,
      done: tasksForPeriod.filter((task) => task.status === 'Готово').length,
      overdue: tasksForPeriod.filter((task) => task.deadline < todayIso() && task.status !== 'Готово').length,
      hours: Math.round(tasksForPeriod.reduce((sum, task) => sum + Number(task.hours || 0), 0) * 10) / 10,
    };
  }, [tasksForPeriod]);

  function openModal(task = null) {
    if (task) {
      setEditingTaskId(task.id);
      setForm({
        title: task.title,
        owner: task.owner,
        deadline: task.deadline,
        period: task.period,
        status: task.status,
        priority: task.priority,
        hours: task.hours,
        start_time: task.start_time || '',
        end_time: task.end_time || '',
        block: task.block || '',
        result: task.result || '',
      });
    } else {
      setEditingTaskId(null);
      setForm(emptyForm(selectedDate, selectedEmployee, view, employeeNames));
    }
    setIsModalOpen(true);
  }

  function movePeriod(direction) {
    if (view === 'month') {
      const next = new Date(`${selectedDate}T00:00:00`);
      next.setMonth(next.getMonth() + direction);
      setSelectedDate(dateToIso(next));
      return;
    }
    const step = view === 'day' ? 1 : 7;
    setSelectedDate(addDays(selectedDate, direction * step));
  }

  async function saveTasks(importedTasks) {
    if (!importedTasks.length) {
      setMessage('В файле не найдено задач для импорта.');
      return;
    }

    const payload = importedTasks.map((task) => ({
      title: task.title,
      owner: task.owner,
      deadline: task.deadline,
      period: task.period,
      status: task.status,
      priority: task.priority,
      hours: Number(task.hours || 0),
      start_time: task.start_time || null,
      end_time: task.end_time || null,
      block: task.block || '',
      result: task.result || '',
    }));

    try {
      if (supabase) {
        const { data, error } = await supabase.from('tasks').insert(payload).select();
        if (error) throw error;
        const normalized = (data || []).map(normalizeTask);
        setTasks((prev) => [...normalized, ...prev]);
        setMessage(`Импортировано задач: ${normalized.length}. Данные сохранены в общей базе.`);
      } else {
        setTasks((prev) => [...importedTasks, ...prev]);
        setMessage(`Импортировано задач локально: ${importedTasks.length}.`);
      }
    } catch (error) {
      setMessage(`Не удалось импортировать задачи: ${error.message}. Проверь, что в Supabase добавлены поля start_time, end_time, block.`);
    }
  }

  async function handleFileImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const lowerName = file.name.toLowerCase();
      const defaultYear = new Date(`${selectedDate}T00:00:00`).getFullYear();

      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
        const imported = parseScheduleWorkbook(workbook, XLSX, importOwner, defaultYear, employeeNames);
        await saveTasks(imported);
        return;
      }

      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        setMessage('CSV-файл пустой или в нем нет строк с задачами.');
        return;
      }
      const headers = parseCsvLine(lines[0]);
      const imported = lines.slice(1).map((line, index) => {
        const values = parseCsvLine(line);
        const row = {};
        headers.forEach((header, headerIndex) => {
          row[header] = values[headerIndex] || '';
        });
        return normalizeCsvTask(row, index, importOwner);
      });
      await saveTasks(imported);
    } catch (error) {
      setMessage(`Ошибка импорта файла: ${error.message}`);
    }
  }

  async function saveTask() {
    if (!form.title.trim()) return;

    const calculatedHours = hoursBetween(form.start_time, form.end_time);
    const payload = {
      title: form.title.trim(),
      owner: form.owner,
      deadline: form.deadline,
      period: form.period,
      status: form.status,
      priority: form.priority,
      hours: Number(form.hours || calculatedHours || 1),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      block: form.block.trim(),
      result: form.result.trim(),
    };

    try {
      if (editingTaskId) {
        const previous = tasks;
        const updatedTask = normalizeTask({
          ...tasks.find((task) => task.id === editingTaskId),
          ...payload,
          id: editingTaskId,
        });
        setTasks((prev) => prev.map((task) => (task.id === editingTaskId ? updatedTask : task)));

        if (supabase && !String(editingTaskId).startsWith('local') && !String(editingTaskId).startsWith('demo') && !String(editingTaskId).startsWith('import') && !String(editingTaskId).startsWith('xlsx')) {
          const { error } = await supabase.from('tasks').update(payload).eq('id', editingTaskId);
          if (error) {
            setTasks(previous);
            throw error;
          }
        }
        setMessage('Изменения в задаче сохранены.');
      } else if (supabase) {
        const { data, error } = await supabase.from('tasks').insert(payload).select().single();
        if (error) throw error;
        setTasks((prev) => [normalizeTask(data), ...prev]);
        setMessage('Задача сохранена в общей базе.');
      } else {
        const localTask = normalizeTask({ ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() });
        setTasks((prev) => [localTask, ...prev]);
        setMessage('Задача сохранена локально.');
      }
      setIsModalOpen(false);
      setEditingTaskId(null);
    } catch (error) {
      setMessage(`Не удалось сохранить задачу: ${error.message}`);
    }
  }

  async function addEmployee() {
    const name = normalizeOwner(employeeForm.name.trim());
    const role = employeeForm.role.trim() || 'Сотрудник';
    if (!name) {
      setMessage('Укажите имя сотрудника.');
      return;
    }
    if (employeeNames.some((employeeName) => employeeName.toLowerCase() === name.toLowerCase())) {
      setMessage('Сотрудник с таким именем уже есть в команде.');
      return;
    }

    const localEmployee = normalizeEmployee({
      id: `local-employee-${Date.now()}`,
      name,
      role,
      color: employeeForm.color,
      created_at: new Date().toISOString(),
    }, employees.length);

    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('employees')
          .insert({ name, role, color: employeeForm.color })
          .select()
          .single();

        if (error) {
          setEmployees((prev) => [...prev, localEmployee]);
          setMessage('Сотрудник добавлен локально. Для общей базы примените файл supabase_employees_update.sql.');
        } else {
          setEmployees((prev) => [...prev, normalizeEmployee(data, prev.length)]);
          setMessage('Сотрудник добавлен в общую базу.');
        }
      } else {
        setEmployees((prev) => [...prev, localEmployee]);
        setMessage('Сотрудник добавлен локально.');
      }

      setEmployeeForm({ name: '', role: '', color: EMPLOYEE_COLORS[(employees.length + 1) % EMPLOYEE_COLORS.length] });
      setIsEmployeeModalOpen(false);
    } catch (error) {
      setMessage(`Не удалось добавить сотрудника: ${error.message}`);
    }
  }

  async function deleteEmployee(employee) {
    if (!employee) return;
    const employeeTasks = tasks.filter((task) => task.owner === employee.name);
    if (employeeTasks.length > 0) {
      setMessage(`Нельзя удалить ${employee.name}: у сотрудника есть задач — ${employeeTasks.length}. Сначала переназначьте их.`);
      return;
    }

    const previous = employees;
    setEmployees((prev) => prev.filter((item) => item.id !== employee.id));

    try {
      if (supabase && !String(employee.id).startsWith('local') && !String(employee.id).startsWith('default')) {
        const { error } = await supabase.from('employees').delete().eq('id', employee.id);
        if (error) throw error;
      }
      setMessage(`Сотрудник ${employee.name} удалён.`);
    } catch (error) {
      setEmployees(previous);
      setMessage(`Не удалось удалить сотрудника: ${error.message}`);
    }
  }

  async function updateStatus(id, status) {
    const previous = tasks;
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, status } : task)));

    try {
      if (supabase && !String(id).startsWith('local') && !String(id).startsWith('demo') && !String(id).startsWith('import') && !String(id).startsWith('xlsx')) {
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
      if (supabase && !String(id).startsWith('local') && !String(id).startsWith('demo') && !String(id).startsWith('import') && !String(id).startsWith('xlsx')) {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (error) throw error;
      }
      setMessage('Задача удалена.');
    } catch (error) {
      setTasks(previous);
      setMessage(`Не удалось удалить задачу: ${error.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_48%,_#f8fafc_100%)] p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-6 text-white shadow-[0_24px_70px_rgba(30,41,59,0.25)] md:px-8 md:py-8"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-violet-100 ring-1 ring-white/10">
                <Sparkles className="mr-2 h-3.5 w-3.5" /> MAVIS GROUP · рабочий центр команды
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Задачи, загрузка и команда — в одном месте</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Планируйте задачи, смотрите календарь, контролируйте просрочки и добавляйте новых сотрудников без правок в коде.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-200">
                <span className="rounded-full bg-violet-500/20 px-3 py-1.5 ring-1 ring-violet-400/20">{employees.length} сотрудников</span>
                <span className="rounded-full bg-sky-500/20 px-3 py-1.5 ring-1 ring-sky-400/20">{summary.total} задач в периоде</span>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1.5 ring-1 ring-emerald-400/20">{summary.done} завершено</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
              <button
                type="button"
                onClick={loadTasks}
                className="inline-flex items-center justify-center rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/15"
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-5 w-5 ${loading ? 'animate-spin' : ''}`} /> Обновить
              </button>
              <button
                type="button"
                onClick={() => setIsEmployeeModalOpen(true)}
                className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-400"
              >
                <UserPlus className="mr-2 h-5 w-5" /> Сотрудник
              </button>
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex items-center justify-center rounded-2xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400"
              >
                <Plus className="mr-2 h-5 w-5" /> Новая задача
              </button>
            </div>
          </div>
        </motion.div>

        {message && (
          <div className="flex items-start rounded-2xl border border-indigo-100 bg-indigo-50/90 p-4 text-sm text-indigo-900 shadow-sm">
            <Database className="mr-2 mt-0.5 h-4 w-4 shrink-0" /> {message}
          </div>
        )}

        <Card>
          <div className="p-4 md:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex flex-wrap rounded-2xl bg-slate-100 p-1">
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
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${view === key ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {view !== 'all' && (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => movePeriod(-1)} className="rounded-xl border bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Предыдущий период">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                    <button type="button" onClick={() => movePeriod(1)} className="rounded-xl border bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Следующий период">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => setSelectedDate(todayIso())} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Сегодня</button>
                  </div>
                )}

                <div className="flex rounded-2xl bg-slate-100 p-1">
                  {[
                    ['calendar', 'Календарь'],
                    ['list', 'Список'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDisplayMode(key)}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${displayMode === key ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Найти задачу"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-9 text-sm md:w-56"
                  />
                </div>
                <select
                  value={selectedEmployee}
                  onChange={(event) => setSelectedEmployee(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option>Все</option>
                  {employeeNames.map((person) => (
                    <option key={person}>{person}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ['all', 'Все задачи'],
                ['active', 'Активные'],
                ['today', 'На сегодня'],
                ['overdue', `Просроченные · ${summary.overdue}`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTaskFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${taskFilter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-sky-50 to-violet-50 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <span className="text-sm font-medium text-slate-700">Импорт Excel/CSV для:</span>
                <select
                  value={importOwner}
                  onChange={(event) => setImportOwner(event.target.value)}
                  className="rounded-xl border border-white bg-white px-3 py-2 text-sm shadow-sm"
                >
                  {employeeNames.map((person) => (
                    <option key={person}>{person}</option>
                  ))}
                </select>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500">
                  <Upload className="mr-2 h-4 w-4" /> Загрузить таблицу
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileImport} />
                </label>
              </div>
              <p className="text-xs text-slate-500">Формат: день + дата, затем время, блок, задача и результат.</p>
            </div>

            <p className="mt-3 text-sm text-slate-500">
              Период: {view === 'all' ? 'все задачи' : `${viewRange.start} — ${viewRange.end}`} · Показано: {visibleTasks.length}
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Metric icon={CalendarDays} label="Всего задач" value={summary.total} tone="violet" />
          <Metric icon={Clock} label="В работе" value={summary.inProgress} tone="blue" />
          <Metric icon={AlertCircle} label="На проверке" value={summary.review} tone="amber" />
          <Metric icon={CheckCircle2} label="Готово" value={summary.done} tone="emerald" />
          <Metric icon={AlertCircle} label="Просрочено" value={summary.overdue} tone="rose" />
          <Metric icon={Users} label="Часов" value={summary.hours} tone="indigo" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card>
            <div className="p-5">
              <div className="mb-5">
                <h2 className="flex items-center text-xl font-semibold">
                  <BarChart3 className="mr-2 h-5 w-5" /> График загрузки
                </h2>
                <p className="text-sm text-slate-500">По количеству часов на выбранный период. Перерывы и свободные слоты импортируются с нулевой загрузкой.</p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={workload}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value, name) => [value, name === 'hours' ? 'Часы' : name]} />
                    <Bar dataKey="hours" radius={[10, 10, 0, 0]}>
                      {workload.map((item) => <Cell key={item.employeeId} fill={item.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Команда</h2>
                  <p className="text-sm text-slate-500">Фильтр задач и загрузка каждого сотрудника.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(true)}
                  className="inline-flex items-center rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
                >
                  <UserPlus className="mr-1.5 h-4 w-4" /> Добавить
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setSelectedEmployee('Все')}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selectedEmployee === 'Все' ? 'border-slate-900 bg-slate-900 text-white shadow-lg' : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Все</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{summary.hours} ч</span>
                  </div>
                </button>
                {workload.map((item) => (
                  <div
                    key={item.fullName}
                    className={`group rounded-2xl border p-3 transition ${selectedEmployee === item.fullName ? 'border-slate-900 bg-slate-900 text-white shadow-lg' : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedEmployee(item.fullName)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white" style={{ backgroundColor: item.color }}>
                          {employeeInitials(item.fullName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold">{item.fullName}</span>
                            <span className={`rounded-full px-2.5 py-1 text-xs ${selectedEmployee === item.fullName ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}>{item.hours} ч</span>
                          </span>
                          <span className={`mt-0.5 block truncate text-xs ${selectedEmployee === item.fullName ? 'text-white/60' : 'text-slate-500'}`}>{item.role}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEmployee(employees.find((employee) => employee.id === item.employeeId))}
                        className={`rounded-xl p-2 opacity-60 transition hover:opacity-100 ${selectedEmployee === item.fullName ? 'hover:bg-white/10' : 'hover:bg-rose-50 hover:text-rose-600'}`}
                        title="Удалить сотрудника"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </div>
                    <button type="button" onClick={() => setSelectedEmployee(item.fullName)} className="mt-3 block w-full text-left">
                      <span className={`block h-2 rounded-full ${selectedEmployee === item.fullName ? 'bg-white/10' : 'bg-slate-100'}`}>
                        <span className="block h-2 rounded-full" style={{ width: `${Math.min(item.hours * 8, 100)}%`, backgroundColor: item.color }} />
                      </span>
                      <span className={`mt-2 block text-sm ${selectedEmployee === item.fullName ? 'text-white/75' : 'text-slate-500'}`}>
                        Задач: {item.tasks} · Готово: {item.done} · Просрочено: {item.overdue}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {displayMode === 'calendar' && view !== 'all' && view !== 'month' && <WeekCalendar tasks={calendarTasks} selectedDate={selectedDate} view={view} onEdit={openModal} />}
        {displayMode === 'calendar' && view === 'month' && <MonthCalendar tasks={calendarTasks} selectedDate={selectedDate} onEdit={openModal} />}
        {displayMode === 'calendar' && view === 'all' && (
          <Card>
            <div className="p-8 text-center text-slate-500">Для календаря выберите день, неделю или месяц.</div>
          </Card>
        )}

        {displayMode === 'list' && (
          <Card>
            <div className="p-5">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="flex items-center text-xl font-semibold"><ListChecks className="mr-2 h-5 w-5" /> Список задач</h2>
                  <p className="text-sm text-slate-500">Задача, ответственный, время, срок, результат, часы.</p>
                </div>
                <button
                  type="button"
                  onClick={() => openModal()}
                  className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-violet-500"
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
                    className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs ${statusStyle(task.status)}`}>{task.status}</span>
                          <span className={`rounded-full px-3 py-1 text-xs ${priorityStyle(task.priority)}`}>{task.priority}</span>
                          {task.block && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{task.block}</span>}
                          {task.deadline < todayIso() && task.status !== 'Готово' && (
                            <span className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">Просрочено</span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold">{task.title}</h3>
                        <p className="text-sm text-slate-600"><b>Результат:</b> {task.result || 'Не указан'}</p>
                        <p className="text-sm text-slate-500">
                          {task.owner} · {task.deadline} · {formatTime(task.start_time)}{task.end_time ? `–${formatTime(task.end_time)}` : ''} · {task.hours} ч
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => openModal(task)}
                          className="inline-flex items-center rounded-xl bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Изменить
                        </button>
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
                          className="inline-flex items-center rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Удалить
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {visibleTasks.length === 0 && (
                  <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-500">Задач по выбранным фильтрам нет.</div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="my-auto w-full max-w-2xl rounded-[2rem] bg-white p-5 shadow-2xl md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{editingTaskId ? 'Редактирование задачи' : 'Новая задача'}</h2>
                <p className="text-sm text-slate-500">Укажите ответственного, срок и ожидаемый результат.</p>
              </div>
              <button type="button" onClick={() => { setIsModalOpen(false); setEditingTaskId(null); }} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-medium">Задача</span>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Например: провести weekly" className="w-full rounded-2xl border px-3 py-2" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Участник</span>
                <select value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} className="w-full rounded-2xl border bg-white px-3 py-2">
                  {employeeNames.map((person) => <option key={person}>{person}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Дата</span>
                <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="w-full rounded-2xl border px-3 py-2" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Начало</span>
                <input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} className="w-full rounded-2xl border px-3 py-2" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Конец</span>
                <input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value, hours: hoursBetween(form.start_time, event.target.value) || form.hours })} className="w-full rounded-2xl border px-3 py-2" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Блок</span>
                <input value={form.block} onChange={(event) => setForm({ ...form, block: event.target.value })} placeholder="Например: Найм" className="w-full rounded-2xl border px-3 py-2" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Загрузка, часов</span>
                <input type="number" min="0" step="0.5" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} className="w-full rounded-2xl border px-3 py-2" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Период</span>
                <select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} className="w-full rounded-2xl border bg-white px-3 py-2">
                  <option value="day">День</option>
                  <option value="week">Неделя</option>
                  <option value="month">Месяц</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Статус</span>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="w-full rounded-2xl border bg-white px-3 py-2">
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Приоритет</span>
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="w-full rounded-2xl border bg-white px-3 py-2">
                  {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-medium">Измеримый результат</span>
                <textarea value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value })} placeholder="Что должно быть готово по итогу" rows="3" className="w-full resize-y rounded-2xl border px-3 py-2" />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setIsModalOpen(false); setEditingTaskId(null); }} className="rounded-2xl border px-5 py-3 text-sm hover:bg-slate-50">Отмена</button>
              <button type="button" onClick={saveTask} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white hover:bg-violet-500">
                {editingTaskId ? 'Сохранить изменения' : 'Создать задачу'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-2xl bg-sky-50 p-2 text-sky-600"><UserPlus className="h-5 w-5" /></div>
                <h2 className="text-2xl font-bold">Добавить сотрудника</h2>
                <p className="mt-1 text-sm text-slate-500">Он сразу появится в задачах, фильтрах, импорте и графике загрузки.</p>
              </div>
              <button type="button" onClick={() => setIsEmployeeModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <label>
                <span className="mb-1 block text-sm font-medium">Имя сотрудника</span>
                <div className="relative">
                  <UserRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={employeeForm.name}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })}
                    placeholder="Например: Мария"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 pl-10"
                  />
                </div>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Должность или роль</span>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={employeeForm.role}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, role: event.target.value })}
                    placeholder="Например: Менеджер по продажам"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 pl-10"
                  />
                </div>
              </label>
              <div>
                <span className="mb-2 block text-sm font-medium">Цвет сотрудника</span>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYEE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setEmployeeForm({ ...employeeForm, color })}
                      className={`h-9 w-9 rounded-full transition ${employeeForm.color === color ? 'ring-2 ring-slate-900 ring-offset-2' : 'hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Выбрать цвет ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Предпросмотр</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold text-white" style={{ backgroundColor: employeeForm.color }}>
                    {employeeInitials(employeeForm.name || 'Новый сотрудник')}
                  </span>
                  <div>
                    <p className="font-semibold">{employeeForm.name || 'Новый сотрудник'}</p>
                    <p className="text-sm text-slate-500">{employeeForm.role || 'Сотрудник'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setIsEmployeeModalOpen(false)} className="rounded-2xl border px-5 py-3 text-sm hover:bg-slate-50">Отмена</button>
              <button type="button" onClick={addEmployee} className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-medium text-white hover:bg-sky-500">Добавить в команду</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
