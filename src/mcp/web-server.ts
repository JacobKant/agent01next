import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// MCP сервер, предоставляющий доступ к веб-ресурсам
const server = new McpServer({
  name: "web-fetch-server",
  version: "1.0.0",
});

// Функция для извлечения текста из HTML
function extractTextFromHtml(html: string): string {
  // Удаляем script и style теги с содержимым
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Удаляем все HTML теги
  text = text.replace(/<[^>]+>/g, " ");
  
  // Декодируем HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Удаляем множественные пробелы и переносы строк
  text = text.replace(/\s+/g, " ");
  
  // Удаляем пробелы в начале и конце
  return text.trim();
}

// Функция для сжатия текста до заданного размера
function compressText(text: string, maxLength: number = 5000): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  // Берем начало и конец текста
  const halfLength = Math.floor(maxLength / 2);
  const start = text.slice(0, halfLength);
  const end = text.slice(-halfLength);
  
  return `${start}\n\n... [текст сокращен, всего ${text.length} символов] ...\n\n${end}`;
}

// Тул для получения содержимого веб-страницы
server.tool(
  "fetch_webpage",
  {
    url: z.string().describe("URL веб-страницы для получения содержимого"),
    maxLength: z
      .number()
      .optional()
      .describe("Максимальная длина текста в символах (по умолчанию 5000)"),
  },
  async ({ url, maxLength }) => {
    console.log("[MCP web-server] Вызван fetch_webpage с url=", url);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ошибка: ${response.status} ${response.statusText}`,
        );
      }

      const contentType = response.headers.get("content-type") || "";
      
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Неподдерживаемый тип контента: ${contentType}`,
                url,
              }, null, 2),
            },
          ],
        };
      }

      const html = await response.text();
      const text = extractTextFromHtml(html);
      const compressed = compressText(text, maxLength || 5000);

      const result = {
        url,
        contentType,
        textLength: text.length,
        compressedLength: compressed.length,
        content: compressed,
      };

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
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Ошибка при получении страницы: ${errorMessage}`,
              url,
            }, null, 2),
          },
        ],
      };
    }
  },
);

// Функция для парсинга результатов поиска DuckDuckGo из HTML
function parseDuckDuckGoResults(html: string, maxResults: number): any[] {
  const results: any[] = [];
  
  // Паттерн для поиска результатов в HTML DuckDuckGo
  // DuckDuckGo использует класс "result" для каждого результата
  const resultPattern = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*result|$)/gi;
  const matches = Array.from(html.matchAll(resultPattern));
  
  let count = 0;
  for (const match of matches) {
    if (count >= maxResults) break;
    
    const resultHtml = match[1];
    
    // Извлекаем заголовок и ссылку
    const titleMatch = resultHtml.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i);
    if (!titleMatch) continue;
    
    const url = titleMatch[1];
    const title = extractTextFromHtml(titleMatch[2]).trim();
    
    // Извлекаем сниппет (описание)
    const snippetMatch = resultHtml.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
                         resultHtml.match(/<span[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    
    let snippet = "";
    if (snippetMatch) {
      snippet = extractTextFromHtml(snippetMatch[1]).trim();
    }
    
    if (title && url) {
      results.push({
        type: "search_result",
        title,
        text: snippet || title,
        url,
      });
      count++;
    }
  }
  
  // Если не нашли результаты через паттерн, пробуем альтернативный метод
  if (results.length === 0) {
    // Пробуем найти результаты через data-testid или другие атрибуты
    const altPattern = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const altMatches = Array.from(html.matchAll(altPattern));
    
    let altCount = 0;
    for (const altMatch of altMatches) {
      if (altCount >= maxResults) break;
      
      const url = altMatch[1];
      const title = extractTextFromHtml(altMatch[2]).trim();
      
      // Пропускаем внутренние ссылки DuckDuckGo
      if (url.includes("duckduckgo.com") || url.includes("javascript:") || !url.startsWith("http")) {
        continue;
      }
      
      if (title && url && title.length > 10) {
        results.push({
          type: "search_result",
          title,
          text: title,
          url,
        });
        altCount++;
      }
    }
  }
  
  return results;
}

// Тул для поиска в интернете через DuckDuckGo
server.tool(
  "search_web",
  {
    query: z.string().describe("Поисковый запрос"),
    maxResults: z
      .number()
      .optional()
      .describe("Максимальное количество результатов (по умолчанию 5)"),
  },
  async ({ query, maxResults }) => {
    console.log("[MCP web-server] Вызван search_web с query=", query);

    try {
      const limit = maxResults || 5;
      const encodedQuery = encodeURIComponent(query);
      
      // Сначала пробуем Instant Answer API для конкретных запросов
      let results: any[] = [];
      
      try {
        const instantResponse = await fetch(
          `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );

        if (instantResponse.ok) {
          const instantData = (await instantResponse.json()) as any;
          
          // Добавляем основной ответ если есть
          if (instantData.AbstractText) {
            results.push({
              type: "abstract",
              title: instantData.Heading || "Основной результат",
              text: instantData.AbstractText,
              url: instantData.AbstractURL,
              source: instantData.AbstractSource,
            });
          }

          // Добавляем связанные темы
          if (instantData.RelatedTopics && Array.isArray(instantData.RelatedTopics)) {
            for (const topic of instantData.RelatedTopics.slice(0, Math.min(limit - results.length, 3))) {
              if (topic.Text && topic.FirstURL) {
                results.push({
                  type: "related",
                  title: topic.Text.split(" - ")[0],
                  text: topic.Text,
                  url: topic.FirstURL,
                });
              }
            }
          }
        }
      } catch (instantError) {
        console.log("[MCP web-server] Instant Answer API не вернул результатов, используем HTML поиск");
      }
      
      // Если Instant Answer не дал результатов, используем HTML поиск
      if (results.length < limit) {
        const htmlResponse = await fetch(
          `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            },
          }
        );

        if (!htmlResponse.ok) {
          throw new Error(
            `HTTP ошибка при HTML поиске: ${htmlResponse.status} ${htmlResponse.statusText}`,
          );
        }

        const html = await htmlResponse.text();
        const htmlResults = parseDuckDuckGoResults(html, limit - results.length);
        results.push(...htmlResults);
      }

      const result = {
        query,
        resultsCount: results.length,
        results,
      };

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
      console.error("[MCP web-server] Ошибка при поиске:", errorMessage);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Ошибка при поиске: ${errorMessage}`,
              query,
            }, null, 2),
          },
        ],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  console.log("[MCP web-server] Старт, ожидание соединения по stdio...");
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP web-сервера:", error);
  process.exit(1);
});

