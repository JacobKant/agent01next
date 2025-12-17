import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Путь к файлу базы данных
const DB_PATH = path.join(process.cwd(), "data", "chats.db");

// Убеждаемся, что директория существует
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Создаем экземпляр базы данных
let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // Включаем режим WAL для лучшей производительности
    
    // Создаем таблицы, если их еще нет
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();

  // Таблица для чатов (сессий)
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Таблица для сообщений (NoSQL-стиль: семантика в JSON-колонке data,
  // отдельными колонками оставляем только поля для индексов)
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
  `);

  // Миграция: если таблица создана по старой схеме, добавляем колонку data
  const columns: { name: string }[] = database
    .prepare("PRAGMA table_info(messages)")
    .all()
    .map((c: any) => ({ name: c.name }));

  const hasDataColumn = columns.some((c) => c.name === "data");
  if (!hasDataColumn) {
    database.exec("ALTER TABLE messages ADD COLUMN data TEXT");
  }

  // Создаем индексы для быстрого поиска по ключевым полям
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at);
  `);
}

// Строка в таблице messages
export type SavedMessageRow = {
  id: string;
  chat_id: string;
  role: string;
  created_at: number;
  data: string | null;
  // Старые поля могут присутствовать в БД — оставляем для обратной совместимости
  content?: string;
  reasoning_details?: string | null;
  response_time?: number | null;
  usage_prompt_tokens?: number | null;
  usage_completion_tokens?: number | null;
  usage_total_tokens?: number | null;
  cost?: number | null;
  model?: string | null;
};

// Сообщение, отдаваемое наружу (для API / UI)
export type LoadedMessage = {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  reasoning_details?: string;
  response_time?: number;
  usage_prompt_tokens?: number;
  usage_completion_tokens?: number;
  usage_total_tokens?: number;
  cost?: number;
  model?: string;
  created_at: number;
  tools_used?: Array<{
    id: string;
    name: string;
    arguments: unknown;
    result: string;
  }>;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
};

export type ChatSession = {
  id: string;
  created_at: number;
  updated_at: number;
};

// Получить или создать чат-сессию
export function getOrCreateChat(chatId: string = "default"): ChatSession {
  const database = getDb();
  
  const existing = database
    .prepare("SELECT * FROM chats WHERE id = ?")
    .get(chatId) as ChatSession | undefined;
  
  if (existing) {
    // Обновляем время последнего обновления
    database
      .prepare("UPDATE chats SET updated_at = ? WHERE id = ?")
      .run(Date.now(), chatId);
    return existing;
  }
  
  // Создаем новую сессию
  const now = Date.now();
  database
    .prepare("INSERT INTO chats (id, created_at, updated_at) VALUES (?, ?, ?)")
    .run(chatId, now, now);
  
  return {
    id: chatId,
    created_at: now,
    updated_at: now,
  };
}

// Сохранить сообщение
export function saveMessage(
  chatId: string,
  message: {
    id: string;
    role: string;
    content: string;
    reasoning_details?: Record<string, unknown>;
    response_time?: number;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    cost?: number;
    model?: string;
    tools_used?: Array<{
      id: string;
      name: string;
      arguments: unknown;
      result: string;
    }>;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
  }
): void {
  const database = getDb();

  // Убеждаемся, что чат существует
  getOrCreateChat(chatId);

  const now = Date.now();

  const payload = {
    id: message.id,
    chat_id: chatId,
    role: message.role,
    content: message.content,
    reasoning_details: message.reasoning_details ?? null,
    response_time: message.response_time ?? null,
    usage: message.usage ?? null,
    cost: message.cost ?? null,
    model: message.model ?? null,
    tools_used: message.tools_used ?? null,
    tool_calls: message.tool_calls ?? null,
    tool_call_id: message.tool_call_id ?? null,
    created_at: now,
  };

  const dataJson = JSON.stringify(payload);

  database
    .prepare(
      `
      INSERT INTO messages (
        id, chat_id, role, created_at, data
      ) VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(message.id, chatId, message.role, now, dataJson);

  // Обновляем время последнего обновления чата
  database
    .prepare("UPDATE chats SET updated_at = ? WHERE id = ?")
    .run(now, chatId);
}

// Загрузить все сообщения для чата
export function loadMessages(chatId: string = "default"): LoadedMessage[] {
  const database = getDb();

  const rows = database
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(chatId) as SavedMessageRow[];

  const messages: LoadedMessage[] = rows.map((row) => {
    let parsed: any = null;
    if (row.data) {
      try {
        parsed = JSON.parse(row.data);
      } catch {
        parsed = null;
      }
    }

    if (parsed) {
      const usage = parsed.usage || null;
      return {
        id: parsed.id ?? row.id,
        chat_id: parsed.chat_id ?? row.chat_id,
        role: parsed.role ?? row.role,
        content: parsed.content ?? row.content ?? "",
        reasoning_details:
          parsed.reasoning_details != null
            ? JSON.stringify(parsed.reasoning_details)
            : row.reasoning_details ?? undefined,
        response_time:
          parsed.response_time != null
            ? parsed.response_time
            : row.response_time ?? undefined,
        usage_prompt_tokens:
          usage && typeof usage.prompt_tokens === "number"
            ? usage.prompt_tokens
            : row.usage_prompt_tokens ?? undefined,
        usage_completion_tokens:
          usage && typeof usage.completion_tokens === "number"
            ? usage.completion_tokens
            : row.usage_completion_tokens ?? undefined,
        usage_total_tokens:
          usage && typeof usage.total_tokens === "number"
            ? usage.total_tokens
            : row.usage_total_tokens ?? undefined,
        cost:
          typeof parsed.cost === "number" ? parsed.cost : row.cost ?? undefined,
        model: parsed.model ?? row.model ?? undefined,
        created_at: parsed.created_at ?? row.created_at,
        tools_used:
          Array.isArray(parsed.tools_used) && parsed.tools_used.length > 0
            ? parsed.tools_used
            : undefined,
        tool_calls:
          Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0
            ? parsed.tool_calls
            : undefined,
        tool_call_id: parsed.tool_call_id ?? undefined,
      };
    }

    // Fallback для старого формата, если data ещё не заполнена
    return {
      id: row.id,
      chat_id: row.chat_id,
      role: row.role,
      content: row.content ?? "",
      reasoning_details: row.reasoning_details ?? undefined,
      response_time: row.response_time ?? undefined,
      usage_prompt_tokens: row.usage_prompt_tokens ?? undefined,
      usage_completion_tokens: row.usage_completion_tokens ?? undefined,
      usage_total_tokens: row.usage_total_tokens ?? undefined,
      cost: row.cost ?? undefined,
      model: row.model ?? undefined,
      created_at: row.created_at,
    };
  });

  return messages;
}

// Получить список всех чатов
export function getAllChats(): ChatSession[] {
  const database = getDb();
  
  const chats = database
    .prepare("SELECT * FROM chats ORDER BY updated_at DESC")
    .all() as ChatSession[];
  
  return chats;
}

// Удалить чат и все его сообщения
export function deleteChat(chatId: string): void {
  const database = getDb();
  
  database.prepare("DELETE FROM chats WHERE id = ?").run(chatId);
  // Сообщения удалятся автоматически благодаря CASCADE
}

// Очистить базу данных (для тестирования)
export function clearDatabase(): void {
  const database = getDb();
  database.exec("DELETE FROM messages; DELETE FROM chats;");
}
