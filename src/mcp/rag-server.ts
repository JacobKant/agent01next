import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LocalIndex } from "vectra";
import { join } from "path";
import { getEmbedding } from "../lib/embeddings.js";

// MCP сервер, предоставляющий доступ к RAG базе знаний
const server = new McpServer({
  name: "rag-search-server",
  version: "1.0.0",
});

// Путь к индексу Vectra
const INDEX_PATH = join(process.cwd(), "document_indexer", "vectra_index");


const MIN_RELEVANCE_THRESHOLD = 0.35;

// Тул для поиска в RAG базе знаний
server.tool(
  "search_rag",
  {
    query: z
      .string()
      .describe(
        `Поисковый запрос для семантического (векторного) поиска в базе знаний.
        
ВАЖНО: Это векторный поиск, который находит тексты семантически схожие с запросом. 
НЕ используйте прямые вопросы типа "Что такое X?" или "Как работает Y?".

ПРАВИЛЬНО: Используйте ключевые слова, фразы или термины, которые вы ожидаете найти в тексте.
- ✅ "оборотные активы баланс"
- ✅ "амортизация основных средств"
- ✅ "налоговый вычет НДС"
- ✅ "бухгалтерский учет прибыль"

НЕПРАВИЛЬНО: Не задавайте вопросы напрямую.
- ❌ "Что такое оборотные активы?"
- ❌ "Как рассчитать амортизацию?"
- ❌ "Объясните налоговый вычет"

Принцип работы: Система ищет фрагменты текста, которые содержат семантически похожие 
концепции, термины и фразы. Чем больше ключевых слов из вашего запроса присутствует 
в документе (или их семантических эквивалентов), тем выше релевантность результата.`
      ),
    topK: z
      .number()
      .optional()
      .describe("Количество наиболее релевантных результатов (по умолчанию 3, максимум 10)"),
  },
  async ({ query, topK }) => {
    console.log("[MCP rag-server] Вызван search_rag с query=", query);

    try {
      // Инициализируем индекс Vectra
      const index = new LocalIndex(INDEX_PATH);

      // Проверяем существование индекса
      if (!(await index.isIndexCreated())) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `Индекс не найден в ${INDEX_PATH}. Сначала запустите индексацию в document_indexer.`,
                  indexPath: INDEX_PATH,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Получаем количество элементов в индексе
      const items = await index.listItems();
      const itemCount = items.length;

      if (itemCount === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Индекс пуст. Сначала запустите индексацию документов.",
                  indexPath: INDEX_PATH,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      console.log(`[MCP rag-server] Найдено ${itemCount} документов в индексе`);

      // Генерируем эмбеддинг для запроса
      console.log("[MCP rag-server] Генерация эмбеддинга для запроса...");
      const queryEmbedding = await getEmbedding(query);

      // Ищем наиболее релевантные документы
      // Ограничиваем максимум 10 результатов для безопасности
      const requestedLimit = topK || 3;
      const limit = Math.min(requestedLimit, 10);
      console.log(`[MCP rag-server] Поиск ${limit} наиболее релевантных документов...`);
      // Используем тот же формат, что и в document_indexer/search.ts
      const allResults = await (index as any).queryItems(queryEmbedding, limit);
      const initialResults = allResults.slice(0, limit);

      // ВТОРОЙ ЭТАП: Фильтрация по порогу релевантности
      const threshold = MIN_RELEVANCE_THRESHOLD;
      let results = initialResults;
      let filteredCount = 0;

      if (threshold > 0) {
        console.log(`[MCP rag-server] Применение фильтра релевантности (порог: ${threshold.toFixed(3)})...`);
        const beforeFilterCount = results.length;
        results = results.filter((result: any) => result.score >= threshold);
        filteredCount = beforeFilterCount - results.length;
        
        if (filteredCount > 0) {
          console.log(`[MCP rag-server] Отфильтровано ${filteredCount} результатов ниже порога ${threshold.toFixed(3)} (было: ${beforeFilterCount}, осталось: ${results.length})`);
        } else {
          console.log(`[MCP rag-server] Все результаты прошли фильтр релевантности`);
        }
        
        // Логируем информацию о фильтрации даже если все результаты отфильтрованы
        if (results.length === 0 && beforeFilterCount > 0) {
          console.log(`[MCP rag-server] ВНИМАНИЕ: Все ${beforeFilterCount} результатов были отфильтрованы из-за порога релевантности ${threshold.toFixed(3)}`);
        }
      }

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query,
                  resultsCount: 0,
                  message: "Релевантные документы не найдены",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Функция для ограничения длины текста
      const truncateText = (text: string, maxLength: number = 800): string => {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + "... [текст обрезан]";
      };

      // Формируем компактные результаты (только топ-3 для контекста)
      const topResults = results.slice(0, 3);
      const formattedResults = topResults.map((result: any, index: number) => {
        const fullText = result.item.metadata.text as string;
        const truncatedText = truncateText(fullText, 800);
        
        return {
          rank: index + 1,
          score: result.score,
          relevance: `${(result.score * 100).toFixed(2)}%`,
          text: truncatedText,
          textLength: fullText.length,
          metadata: {
            chunkIndex: result.item.metadata.chunkIndex as number,
          },
        };
      });

      // Формируем компактный контекст для RAG
      const context = formattedResults
        .map(
          (result: { relevance: string; text: string }, idx: number) =>
            `[Документ ${idx + 1}, релевантность: ${result.relevance}]\n${result.text}`
        )
        .join("\n\n--- --- ---\n\n");

      // Возвращаем только компактный ответ с контекстом
      const result = {
        query,
        resultsCount: results.length,
        totalDocumentsInIndex: itemCount,
        context: context,
        filtering: threshold > 0 ? {
          threshold: threshold,
          filteredOut: filteredCount,
          initialCount: initialResults.length,
        } : undefined,
        summary: threshold > 0 && filteredCount > 0
          ? `Найдено ${initialResults.length} документов, после фильтрации (порог ${threshold.toFixed(3)}) осталось ${results.length}. Показаны топ-${formattedResults.length} с релевантностью от ${formattedResults[0]?.relevance || "N/A"}.`
          : `Найдено ${results.length} релевантных документов. Показаны топ-${formattedResults.length} с релевантностью от ${formattedResults[0]?.relevance || "N/A"}.`,
      };

      console.log(
        `[MCP rag-server] Найдено ${formattedResults.length} релевантных документов`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[MCP rag-server] Ошибка при поиске:", errorMessage);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при поиске в RAG базе знаний: ${errorMessage}`,
                query,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  console.log("[MCP rag-server] Старт, ожидание соединения по stdio...");
  console.log(`[MCP rag-server] Путь к индексу: ${INDEX_PATH}`);
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP rag-сервера:", error);
  process.exit(1);
});

