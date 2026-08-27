# MAVIS Task Tracker 6.2

Проектный дашборд MAVIS GROUP с Supabase и Bitrix24 Вайбкод AI.

## Команды

```bash
npm install
npm run build
npm start
```

## Переменные окружения

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VIBECODE_API_KEY
VIBECODE_MODEL=bitrix/bitrixgpt-5.5
```

`VIBECODE_API_KEY` — только серверный секрет. Никогда не добавляйте к нему префикс `VITE_`.

## 6.2.3 — Бэклог
Добавлена отдельная вкладка Бэклог для временно неактуальных проектов и задач. Перед использованием выполнить supabase_v6_2_3_backlog.sql.
