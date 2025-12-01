## AI чат на Next.js + OpenRouter


### Быстрый старт

1. Скопируйте пример настроек в файл .env.localи добавьте свой ключ:
```bash
cp env.local.example .env.local
# затем пропишите OPENROUTER_API_KEY=...
```

2. Установите зависимости и запустите dev-сервер:
```bash
npm install
npm run dev
```

3. Откройте [http://localhost:3000](http://localhost:3000) и начните переписку. Клиент ведёт историю сообщений и передаёт их на endpoint `/api/chat`.

### Переменные окружения

| Ключ | Назначение | Значение по умолчанию |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | обязательный ключ доступа к OpenRouter | — |
| `OPENROUTER_MODEL` | идентификатор модели | `x-ai/grok-4.1-fast:free` |
| `OPENROUTER_BASE_URL` | базовый URL API | `https://openrouter.ai/api/v1/chat/completions` |
| `OPENROUTER_HTTP_REFERER` | передаётся в заголовке `HTTP-Referer` | `http://localhost:3000` |
| `OPENROUTER_APP_NAME` | значение заголовка `X-Title` | `Agent01 Chat` |

### Проверка и билды

```bash
npm run lint  # проверка линтером
npm run build # production-сборка
npm run start # запуск собранного приложения
```
