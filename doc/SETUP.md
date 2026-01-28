# Руководство по настройке Agent01Next

## Требования

- **Node.js**: версия 18.x или выше
- **npm**: версия 9.x или выше
- **Операционная система**: Windows, macOS, или Linux

## Установка

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd agent01next
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка переменных окружения

Скопируйте файл примера:

```bash
cp env.local.example .env.local
```

Откройте `.env.local` и заполните необходимые переменные:

```env
# Обязательные переменные
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Опциональные переменные для OpenRouter
OPENROUTER_MODEL=x-ai/grok-4.1-fast:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1/chat/completions
OPENROUTER_HTTP_REFERER=http://localhost:3000
OPENROUTER_APP_NAME=Agent01 Chat

# Telegram Bot (опционально, для уведомлений)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

## Получение API ключей

### OpenRouter API Key

1. Зарегистрируйтесь на [OpenRouter.ai](https://openrouter.ai/)
2. Перейдите в раздел "Keys"
3. Создайте новый API ключ
4. Скопируйте ключ в формат `sk-or-...`
5. Добавьте в `.env.local` как `OPENROUTER_API_KEY`

### Telegram Bot Token

1. Откройте Telegram и найдите [@BotFather](https://t.me/BotFather)
2. Отправьте команду `/newbot`
3. Следуйте инструкциям для создания бота
4. Скопируйте полученный токен
5. Добавьте в `.env.local` как `TELEGRAM_BOT_TOKEN`

## Настройка базы данных

База данных SQLite создается автоматически при первом запуске приложения.

Расположение: `data/chats.db`

Если нужно пересоздать базу данных:

```bash
# Удалите существующую БД
rm data/chats.db

# При следующем запуске БД создастся автоматически
npm run dev
```

## Настройка RAG индексации

Для работы RAG поиска необходимо проиндексировать документы:

1. Перейдите в папку `document_indexer`:

```bash
cd document_indexer
npm install
```

2. Поместите документы для индексации в `document_indexer/data/rawData/`

3. Запустите индексацию:

```bash
npm start
```

Индекс будет создан в `document_indexer/vectra_index/`

Подробнее: [RAG_INDEXER.md](RAG_INDEXER.md)

## Запуск приложения

### Режим разработки

```bash
npm run dev
```

Приложение будет доступно по адресу: [http://localhost:3000](http://localhost:3000)

### Production сборка

```bash
npm run build
npm run start
```

### Запуск MCP сервера отдельно (для тестирования)

```bash
npm run mcp:server
```

## Проверка работоспособности

### 1. Проверка API ключей

После запуска приложения проверьте консоль на наличие ошибок подключения к API.

### 2. Проверка MCP серверов

В консоли должны появиться сообщения о подключении к MCP серверам:

```
[MCP Client] Подключен к серверу cbr-rates-server, тулов: 1
[MCP Client] Подключен к серверу web-fetch-server, тулов: 1
[MCP Client] Подключен к серверу file-server, тулов: X
[MCP Client] Подключен к серверу rag-search-server, тулов: 1
[MCP Client] Всего доступно тулов: X
```

### 3. Проверка базы данных

Откройте чат в браузере и отправьте тестовое сообщение. Проверьте, что сообщение сохраняется в БД:

```bash
# Используйте SQLite CLI для проверки
sqlite3 data/chats.db "SELECT COUNT(*) FROM messages;"
```

### 4. Проверка RAG поиска

Если настроена индексация, попробуйте запросить у AI информацию из индексированных документов.

## Настройка планировщика задач

Планировщик запускается автоматически при старте приложения.

Для настройки задач:

1. Откройте файл задачи в `src/lib/tasks/`
2. Измените `cronExpression` для нужного расписания
3. Установите `enabled: true` для активации

Примеры cron выражений:
- `"0 9 * * *"` - Каждый день в 9:00
- `"0 */2 * * *"` - Каждые 2 часа
- `"0 0 * * 1"` - Каждый понедельник в полночь
- `"*/15 * * * *"` - Каждые 15 минут

Подробнее: [SCHEDULER.md](SCHEDULER.md)

## Настройка для разных окружений

### Development

Используйте `.env.local` для локальной разработки.

### Production

Создайте `.env.production` или используйте переменные окружения системы:

```bash
export OPENROUTER_API_KEY=sk-or-...
npm run build
npm run start
```

### Docker (опционально)

Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Решение проблем

### Ошибка подключения к OpenRouter

1. Проверьте правильность API ключа в `.env.local`
2. Убедитесь, что ключ имеет формат `sk-or-...`
3. Проверьте баланс на OpenRouter.ai

### MCP серверы не подключаются

1. Убедитесь, что установлены все зависимости: `npm install`
2. Проверьте, что пути к серверам в `mcp-client.ts` корректны
3. Проверьте логи в консоли на наличие ошибок

### База данных не создается

1. Убедитесь, что папка `data/` существует и доступна для записи
2. Проверьте права доступа к файловой системе
3. Проверьте логи на наличие ошибок инициализации БД

### RAG поиск не работает

1. Убедитесь, что индекс создан: проверьте наличие `document_indexer/vectra_index/`
2. Проверьте, что путь к индексу в `rag-server.ts` корректен
3. Убедитесь, что OpenRouter API ключ настроен (для генерации эмбеддингов)

### Планировщик не запускается

1. Проверьте, что задачи зарегистрированы в `scheduler-init.ts`
2. Убедитесь, что cron выражения корректны
3. Проверьте логи на наличие ошибок

## Дополнительные настройки

### Изменение порта

По умолчанию Next.js использует порт 3000. Для изменения:

```bash
PORT=3001 npm run dev
```

Или создайте файл `.env.local`:

```env
PORT=3001
```

### Настройка лимитов токенов

В файле `src/app/page.tsx` можно изменить доступные модели и их настройки.

### Настройка температуры и других параметров

Параметры генерации можно изменить в UI чата или в коде `src/app/api/chat/route.ts`.

## Обновление проекта

```bash
# Обновить зависимости
npm update

# Пересобрать проект
npm run build
```

## Резервное копирование

### База данных

```bash
# Создать резервную копию БД
cp data/chats.db data/chats.db.backup

# Восстановить из резервной копии
cp data/chats.db.backup data/chats.db
```

### RAG индекс

```bash
# Создать резервную копию индекса
tar -czf vectra_index_backup.tar.gz document_indexer/vectra_index/

# Восстановить индекс
tar -xzf vectra_index_backup.tar.gz
```

## Безопасность

### Рекомендации

1. **Никогда не коммитьте `.env.local`** в репозиторий
2. Используйте разные API ключи для development и production
3. Ограничьте доступ к файлам базы данных
4. Регулярно обновляйте зависимости: `npm audit` и `npm update`
5. Используйте HTTPS в production окружении

### Проверка безопасности зависимостей

```bash
npm audit
npm audit fix
```
