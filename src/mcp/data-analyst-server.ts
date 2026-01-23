import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseFile, listDataFiles, ParsedData } from "../lib/data-parser";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";

// Директория для хранения загруженных файлов
const DATA_DIR = join(process.cwd(), "data", "analyst");

// Убеждаемся, что директория существует
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const server = new McpServer({
  name: "data-analyst-server",
  version: "1.0.0",
});

/**
 * Получить список всех загруженных файлов
 */
server.tool(
  "list_data_files",
  {},
  async () => {
    console.log("[data-analyst-server] Вызван list_data_files");

    try {
      const files = listDataFiles(DATA_DIR);
      const fileInfo = files.map((filePath) => {
        try {
          const parsed = parseFile(filePath);
          return {
            filePath,
            fileName: parsed.metadata.fileName,
            format: parsed.format,
            totalRows: parsed.metadata.totalRows,
            columns: parsed.columns || [],
          };
        } catch (error) {
          return {
            filePath,
            fileName: filePath.split(/[/\\]/).pop() || "",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                files: fileInfo,
                totalFiles: fileInfo.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
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

/**
 * Загрузить и проанализировать файл
 */
server.tool(
  "load_data_file",
  {
    fileName: z.string().describe("Имя файла для загрузки (из списка list_data_files)"),
  },
  async ({ fileName }) => {
    console.log("[data-analyst-server] Вызван load_data_file с fileName=", fileName);

    try {
      const filePath = join(DATA_DIR, fileName);
      const parsed = parseFile(filePath);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                data: {
                  format: parsed.format,
                  columns: parsed.columns,
                  totalRows: parsed.metadata.totalRows,
                  sampleRows: parsed.rows.slice(0, 10), // Первые 10 строк для примера
                },
                metadata: parsed.metadata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
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

/**
 * Получить статистику по данным
 */
server.tool(
  "get_data_statistics",
  {
    fileName: z.string().describe("Имя файла для анализа"),
    column: z.string().optional().describe("Конкретная колонка для анализа (опционально)"),
  },
  async ({ fileName, column }) => {
    console.log("[data-analyst-server] Вызван get_data_statistics с fileName=", fileName, "column=", column);

    try {
      const filePath = join(DATA_DIR, fileName);
      const parsed = parseFile(filePath);

      if (parsed.rows.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "Файл пуст",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const stats: any = {
        totalRows: parsed.rows.length,
        columns: parsed.columns || [],
      };

      // Если указана конкретная колонка
      if (column && parsed.columns?.includes(column)) {
        const values = parsed.rows
          .map((row: any) => row[column])
          .filter((v) => v !== null && v !== undefined && v !== "");

        // Подсчет частоты значений
        const frequency: Record<string, number> = {};
        values.forEach((v) => {
          const key = String(v);
          frequency[key] = (frequency[key] || 0) + 1;
        });

        // Сортируем по частоте
        const sortedFrequency = Object.entries(frequency)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 20); // Топ 20

        stats.columnStats = {
          column,
          totalValues: values.length,
          uniqueValues: Object.keys(frequency).length,
          mostFrequent: sortedFrequency,
        };
      } else {
        // Статистика по всем колонкам
        const columnStats: Record<string, any> = {};

        parsed.columns?.forEach((col) => {
          const values = parsed.rows
            .map((row: any) => row[col])
            .filter((v) => v !== null && v !== undefined && v !== "");

          if (values.length > 0) {
            const frequency: Record<string, number> = {};
            values.forEach((v) => {
              const key = String(v);
              frequency[key] = (frequency[key] || 0) + 1;
            });

            const sortedFrequency = Object.entries(frequency)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10);

            columnStats[col] = {
              totalValues: values.length,
              uniqueValues: Object.keys(frequency).length,
              mostFrequent: sortedFrequency,
            };
          }
        });

        stats.allColumnsStats = columnStats;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                statistics: stats,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
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

/**
 * Поиск в данных по условию
 */
server.tool(
  "search_data",
  {
    fileName: z.string().describe("Имя файла для поиска"),
    column: z.string().optional().describe("Колонка для поиска (опционально)"),
    query: z.string().describe("Текст для поиска"),
    limit: z.number().optional().describe("Максимальное количество результатов (по умолчанию 20)"),
  },
  async ({ fileName, column, query, limit = 20 }) => {
    console.log("[data-analyst-server] Вызван search_data с fileName=", fileName, "query=", query);

    try {
      const filePath = join(DATA_DIR, fileName);
      const parsed = parseFile(filePath);

      const lowerQuery = query.toLowerCase();

      const results = parsed.rows.filter((row: any) => {
        if (column && parsed.columns?.includes(column)) {
          // Поиск в конкретной колонке
          const value = String(row[column] || "").toLowerCase();
          return value.includes(lowerQuery);
        } else {
          // Поиск во всех колонках
          return Object.values(row).some((value) =>
            String(value || "").toLowerCase().includes(lowerQuery)
          );
        }
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                query,
                column: column || "all",
                totalMatches: results.length,
                results: results.slice(0, limit),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
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

/**
 * Анализ ошибок в логах
 */
server.tool(
  "analyze_errors",
  {
    fileName: z.string().describe("Имя файла лога для анализа"),
  },
  async ({ fileName }) => {
    console.log("[data-analyst-server] Вызван analyze_errors с fileName=", fileName);

    try {
      const filePath = join(DATA_DIR, fileName);
      const parsed = parseFile(filePath);

      // Ищем строки с ошибками
      const errorKeywords = ["error", "exception", "fail", "failed", "ошибка", "исключение"];
      const errors = parsed.rows.filter((row: any) => {
        const text = JSON.stringify(row).toLowerCase();
        return errorKeywords.some((keyword) => text.includes(keyword));
      });

      // Группируем по типу ошибки
      const errorGroups: Record<string, number> = {};
      errors.forEach((error: any) => {
        const message = error.message || error.raw || JSON.stringify(error);
        // Извлекаем ключевое слово
        const keyword = errorKeywords.find((kw) => message.toLowerCase().includes(kw)) || "other";
        errorGroups[keyword] = (errorGroups[keyword] || 0) + 1;
      });

      // Сортируем по частоте
      const sortedErrors = Object.entries(errorGroups)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => ({ type, count }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                totalErrors: errors.length,
                errorTypes: sortedErrors,
                sampleErrors: errors.slice(0, 10),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
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
  console.log("[data-analyst-server] Старт, ожидание соединения по stdio...");
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске data-analyst-server:", error);
  process.exit(1);
});
