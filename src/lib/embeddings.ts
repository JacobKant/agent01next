import dotenv from 'dotenv';
import { join } from 'path';

// Загружаем переменные окружения из корня проекта
const projectRoot = process.cwd();
const envPath = join(projectRoot, '.env.local');

// Пытаемся загрузить .env.local, если не найден - пробуем .env
dotenv.config({ path: envPath });
if (!process.env.OPENROUTER_API_KEY) {
    dotenv.config({ path: join(projectRoot, '.env') });
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";

/**
 * Получает эмбеддинг текста через OpenRouter API используя модель qwen/qwen3-embedding-8b
 * @param text Текст для получения эмбеддинга
 * @returns Массив чисел (вектор эмбеддинга)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY не найден. Добавьте ключ в .env.local и перезапустите скрипт."
    );
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Document Indexer",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter вернул ошибку ${response.status}: ${errorText}`.trim()
    );
  }

  const result = await response.json();
  
  if (!result.data || !result.data[0] || !result.data[0].embedding) {
    throw new Error("OpenRouter не вернул эмбеддинг");
  }

  return result.data[0].embedding as number[];
}

