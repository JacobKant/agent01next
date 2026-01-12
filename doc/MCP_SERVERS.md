# Документация по MCP серверам

## Обзор

MCP (Model Context Protocol) серверы расширяют функциональность AI чата, предоставляя инструменты для взаимодействия с внешними системами и данными.

## Архитектура MCP

### Как это работает

1. **MCP Сервер** - Изолированный процесс, предоставляющий набор инструментов (tools)
2. **MCP Клиент** - Подключается к серверам и управляет вызовами инструментов
3. **LLM** - Использует инструменты через стандартизированный интерфейс

### Коммуникация

- **Transport**: stdio (стандартный ввод/вывод)
- **Протокол**: JSON-RPC через MCP SDK
- **Формат инструментов**: OpenAI-compatible function calling

## Встроенные MCP серверы

### 1. CBR Rates Server (`server.ts`)

**Назначение**: Получение курсов валют Центрального Банка РФ

**Инструменты**:
- `cbr_rates` - Получение курсов валют

**Параметры**:
```typescript
{
  code?: string  // Код валюты (USD, EUR и т.д.). Если не указан - все валюты
}
```

**Пример использования**:
```
Пользователь: "Какой курс доллара?"
AI: [вызывает cbr_rates с code="USD"]
AI: "Курс доллара США: 75.50 рублей"
```

**Источник данных**: https://www.cbr-xml-daily.ru/daily_json.js

### 2. Web Fetch Server (`web-server.ts`)

**Назначение**: Веб-поиск и получение контента с веб-сайтов

**Инструменты**:
- `web_search` - Поиск в интернете
- `fetch_url` - Получение контента с URL

**Пример использования**:
```
Пользователь: "Найди информацию о Next.js"
AI: [вызывает web_search с query="Next.js"]
AI: [получает результаты и отвечает]
```

### 3. File Server (`file-server.ts`)

**Назначение**: Работа с файловой системой

**Инструменты**:
- `read_file` - Чтение файла
- `write_file` - Запись файла
- `list_directory` - Список файлов в директории
- `search_files` - Поиск файлов

**Ограничения безопасности**:
- Доступ только к определенным директориям
- Валидация путей для предотвращения path traversal

**Пример использования**:
```
Пользователь: "Прочитай файл README.md"
AI: [вызывает read_file с path="README.md"]
AI: [читает и отвечает на основе содержимого]
```

### 4. RAG Search Server (`rag-server.ts`)

**Назначение**: Семантический поиск по индексированным документам

**Инструменты**:
- `search_rag` - Поиск в RAG базе знаний

**Параметры**:
```typescript
{
  query: string      // Поисковый запрос
  topK?: number      // Количество результатов (по умолчанию 3, максимум 10)
}
```

**Пример использования**:
```
Пользователь: "Что такое оборотные активы?"
AI: [вызывает search_rag с query="оборотные активы"]
AI: [получает релевантные фрагменты и отвечает]
```

**Важно**: 
- Используйте ключевые слова, а не прямые вопросы
- Правильно: "оборотные активы баланс"
- Неправильно: "Что такое оборотные активы?"

Подробнее: [RAG_INDEXER.md](RAG_INDEXER.md)

## Регистрация серверов

Серверы регистрируются в `src/lib/mcp-client.ts`:

```typescript
private servers: McpServerConfig[] = [
  {
    name: "cbr-rates-server",
    serverPath: join(process.cwd(), "src", "mcp", "server.ts"),
  },
  // ... другие серверы
];
```

### Типы конфигурации

**Локальный сервер** (через tsx):
```typescript
{
  name: "my-server",
  serverPath: join(process.cwd(), "src", "mcp", "my-server.ts"),
}
```

**NPM пакет** (через npx):
```typescript
{
  name: "my-server",
  command: "npx",
  args: ["-y", "my-mcp-server"],
}
```

## Создание нового MCP сервера

### Шаг 1: Создание файла сервера

Создайте файл в `src/mcp/my-server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-server",
  version: "1.0.0",
});

// Определение инструмента
server.tool(
  "my_tool",
  {
    param1: z.string().describe("Описание параметра 1"),
    param2: z.number().optional().describe("Описание параметра 2"),
  },
  async ({ param1, param2 }) => {
    // Логика инструмента
    const result = {
      message: `Обработано: ${param1}`,
      value: param2 ?? 0,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP сервера:", error);
  process.exit(1);
});
```

### Шаг 2: Регистрация в клиенте

Добавьте сервер в `src/lib/mcp-client.ts`:

```typescript
private servers: McpServerConfig[] = [
  // ... существующие серверы
  {
    name: "my-server",
    serverPath: join(process.cwd(), "src", "mcp", "my-server.ts"),
  },
];
```

### Шаг 3: Тестирование

Запустите сервер отдельно для тестирования:

```bash
npx tsx src/mcp/my-server.ts
```

Или используйте встроенную команду:

```bash
npm run mcp:server
```

## Лучшие практики

### 1. Валидация входных данных

Всегда используйте Zod для валидации:

```typescript
server.tool(
  "my_tool",
  {
    url: z.string().url().describe("Валидный URL"),
    limit: z.number().min(1).max(100).optional(),
  },
  async ({ url, limit }) => {
    // url гарантированно валидный
  }
);
```

### 2. Обработка ошибок

Всегда обрабатывайте ошибки:

```typescript
async ({ param }) => {
  try {
    const result = await someAsyncOperation(param);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
}
```

### 3. Логирование

Используйте префиксы для логирования:

```typescript
console.log("[My Server] Вызван my_tool с param=", param);
```

### 4. Безопасность

- Валидируйте все входные данные
- Ограничивайте доступ к файловой системе
- Не выполняйте произвольный код
- Ограничивайте размер ответов

### 5. Описание инструментов

Всегда предоставляйте понятные описания:

```typescript
server.tool(
  "my_tool",
  {
    query: z.string().describe(
      "Поисковый запрос. Используйте ключевые слова, а не вопросы."
    ),
  },
  async ({ query }) => {
    // ...
  }
);
```

## Отладка

### Логирование

Все серверы логируют свои действия:

```
[MCP server] Старт, ожидание соединения по stdio...
[MCP server] Вызван cbr_rates с code=USD
```

### Тестирование отдельного сервера

```bash
# Запустите сервер
npx tsx src/mcp/my-server.ts

# В другом терминале отправьте JSON-RPC запрос
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"my_tool","arguments":{"param1":"test"}}}' | npx tsx src/mcp/my-server.ts
```

### Проверка подключения

При запуске приложения проверьте логи:

```
[MCP Client] Подключен к серверу my-server, тулов: 1
[MCP Client] Всего доступно тулов: X
```

## Производительность

### Оптимизация

1. **Кэширование**: Кэшируйте результаты где возможно
2. **Асинхронность**: Используйте async/await для неблокирующих операций
3. **Ограничения**: Ограничивайте размер ответов и время выполнения

### Мониторинг

Отслеживайте:
- Время выполнения инструментов
- Количество вызовов
- Ошибки выполнения

## Расширенные возможности

### Ресурсы

MCP поддерживает не только инструменты, но и ресурсы (resources). Ресурсы предоставляют доступ к данным:

```typescript
server.resource(
  "file://config",
  "Конфигурация приложения",
  async (uri) => {
    const config = await loadConfig();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(config),
    };
  }
);
```

### Промпты

Промпты позволяют создавать шаблоны для LLM:

```typescript
server.prompt(
  "summarize",
  "Суммаризация текста",
  {
    text: z.string().describe("Текст для суммаризации"),
  },
  async ({ text }) => {
    return {
      messages: [
        {
          role: "user",
          content: `Суммаризируй следующий текст:\n\n${text}`,
        },
      ],
    };
  }
);
```

## Примеры использования

### Пример 1: API интеграция

```typescript
server.tool(
  "get_weather",
  {
    city: z.string().describe("Название города"),
  },
  async ({ city }) => {
    const response = await fetch(`https://api.weather.com/${city}`);
    const data = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
    };
  }
);
```

### Пример 2: Работа с базой данных

```typescript
server.tool(
  "query_db",
  {
    query: z.string().describe("SQL запрос"),
  },
  async ({ query }) => {
    // Валидация и выполнение запроса
    const results = await db.query(query);
    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
    };
  }
);
```

## Решение проблем

### Сервер не запускается

1. Проверьте установку зависимостей: `npm install`
2. Проверьте синтаксис TypeScript: `npx tsc --noEmit`
3. Проверьте логи на наличие ошибок

### Инструмент не вызывается

1. Убедитесь, что сервер зарегистрирован в `mcp-client.ts`
2. Проверьте, что инструмент правильно определен
3. Проверьте логи подключения клиента

### Ошибки выполнения

1. Проверьте валидацию входных данных
2. Убедитесь в правильной обработке ошибок
3. Проверьте логи сервера

## Дополнительные ресурсы

- [MCP SDK Documentation](https://modelcontextprotocol.io/)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Zod Documentation](https://zod.dev/)
