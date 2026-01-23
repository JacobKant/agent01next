/**
 * Библиотека для парсинга различных форматов данных
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export type DataFormat = "csv" | "json" | "log" | "txt";

export interface ParsedData {
  format: DataFormat;
  rows: any[];
  columns?: string[];
  metadata: {
    totalRows: number;
    filePath: string;
    fileName: string;
  };
}

/**
 * Определяет формат файла по расширению
 */
export function detectFormat(fileName: string): DataFormat {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (ext === "log" || ext === "txt") return "log";
  return "txt";
}

/**
 * Парсит CSV файл
 */
export function parseCSV(content: string): ParsedData {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    return {
      format: "csv",
      rows: [],
      columns: [],
      metadata: {
        totalRows: 0,
        filePath: "",
        fileName: "",
      },
    };
  }

  // Определяем разделитель (запятая или точка с запятой)
  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  // Парсим заголовки
  const headers = firstLine
    .split(delimiter)
    .map((h) => h.trim().replace(/^"|"$/g, ""));

  // Парсим строки данных
  const rows = lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });

  return {
    format: "csv",
    rows,
    columns: headers,
    metadata: {
      totalRows: rows.length,
      filePath: "",
      fileName: "",
    },
  };
}

/**
 * Парсит JSON файл
 */
export function parseJSON(content: string): ParsedData {
  try {
    const data = JSON.parse(content);

    // Если это массив объектов
    if (Array.isArray(data)) {
      const firstItem = data[0];
      const columns =
        typeof firstItem === "object" && firstItem !== null
          ? Object.keys(firstItem)
          : undefined;

      return {
        format: "json",
        rows: data,
        columns,
        metadata: {
          totalRows: data.length,
          filePath: "",
          fileName: "",
        },
      };
    }

    // Если это объект
    if (typeof data === "object" && data !== null) {
      // Если это объект с массивом данных
      if (Array.isArray(data.data)) {
        const firstItem = data.data[0];
        const columns =
          typeof firstItem === "object" && firstItem !== null
            ? Object.keys(firstItem)
            : undefined;

        return {
          format: "json",
          rows: data.data,
          columns,
          metadata: {
            totalRows: data.data.length,
            filePath: "",
            fileName: "",
          },
        };
      }

      // Обычный объект - преобразуем в массив из одного элемента
      return {
        format: "json",
        rows: [data],
        columns: Object.keys(data),
        metadata: {
          totalRows: 1,
          filePath: "",
          fileName: "",
        },
      };
    }

    // Примитивные значения
    return {
      format: "json",
      rows: [data],
      columns: undefined,
      metadata: {
        totalRows: 1,
        filePath: "",
        fileName: "",
      },
    };
  } catch (error) {
    throw new Error(`Ошибка парсинга JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Парсит лог файл (каждая строка - отдельная запись)
 */
export function parseLog(content: string): ParsedData {
  const lines = content.split("\n").filter((line) => line.trim());

  // Пытаемся определить структуру лога
  // Ищем паттерны типа: [TIMESTAMP] LEVEL: MESSAGE
  const logPattern = /^(\[[^\]]+\]|\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2})?\s*(\w+)?\s*:?\s*(.*)$/;

  const rows = lines.map((line, index) => {
    const match = line.match(logPattern);
    if (match) {
      return {
        line_number: index + 1,
        timestamp: match[1] || "",
        level: match[2] || "",
        message: match[3] || line,
        raw: line,
      };
    }
    return {
      line_number: index + 1,
      raw: line,
    };
  });

  return {
    format: "log",
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : undefined,
    metadata: {
      totalRows: rows.length,
      filePath: "",
      fileName: "",
    },
  };
}

/**
 * Парсит файл в зависимости от формата
 */
export function parseFile(filePath: string): ParsedData {
  if (!existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  const fileName = filePath.split(/[/\\]/).pop() || "";
  const format = detectFormat(fileName);

  let parsed: ParsedData;

  switch (format) {
    case "csv":
      parsed = parseCSV(content);
      break;
    case "json":
      parsed = parseJSON(content);
      break;
    case "log":
    case "txt":
      parsed = parseLog(content);
      break;
    default:
      parsed = parseLog(content);
  }

  parsed.metadata.filePath = filePath;
  parsed.metadata.fileName = fileName;

  return parsed;
}

/**
 * Получает список всех файлов в директории данных
 */
export function listDataFiles(dataDir: string): string[] {
  if (!existsSync(dataDir)) {
    return [];
  }

  const files: string[] = [];
  const entries = readdirSync(dataDir);

  for (const entry of entries) {
    const fullPath = join(dataDir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile()) {
      const format = detectFormat(entry);
      if (["csv", "json", "log", "txt"].includes(format)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}
