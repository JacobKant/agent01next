import Database from "better-sqlite3";
import { ChatMessage } from "@/types/chat";
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
  
  // Таблица для сообщений
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      reasoning_details TEXT,
      response_time REAL,
      usage_prompt_tokens INTEGER,
      usage_completion_tokens INTEGER,
      usage_total_tokens INTEGER,
      cost REAL,
      model TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
  `);
  
  // Создаем индексы для быстрого поиска
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at);
  `);
}

export type SavedMessage = {
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
  }
): void {
  const database = getDb();
  
  // Убеждаемся, что чат существует
  getOrCreateChat(chatId);
  
  const reasoningDetailsJson = message.reasoning_details
    ? JSON.stringify(message.reasoning_details)
    : null;
  
  database
    .prepare(`
      INSERT INTO messages (
        id, chat_id, role, content, reasoning_details,
        response_time, usage_prompt_tokens, usage_completion_tokens,
        usage_total_tokens, cost, model, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      message.id,
      chatId,
      message.role,
      message.content,
      reasoningDetailsJson,
      message.response_time ?? null,
      message.usage?.prompt_tokens ?? null,
      message.usage?.completion_tokens ?? null,
      message.usage?.total_tokens ?? null,
      message.cost ?? null,
      message.model ?? null,
      Date.now()
    );
  
  // Обновляем время последнего обновления чата
  database
    .prepare("UPDATE chats SET updated_at = ? WHERE id = ?")
    .run(Date.now(), chatId);
}

// Загрузить все сообщения для чата
export function loadMessages(chatId: string = "default"): SavedMessage[] {
  const database = getDb();
  
  const messages = database
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(chatId) as SavedMessage[];
  
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
