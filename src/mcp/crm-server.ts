import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// MCP сервер, эмулирующий доступ к CRM системе
const server = new McpServer({
  name: "crm-server",
  version: "1.0.0",
});

// Путь к файлу с тестовыми данными CRM
const CRM_DATA_PATH = join(process.cwd(), "crm_data.json");

// Типы данных для CRM
interface User {
  id: string;
  email: string;
  name: string;
  status: "active" | "inactive" | "suspended";
  createdAt: string;
  lastLogin?: string;
}

interface Ticket {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  tags?: string[];
}

interface CrmData {
  users: User[];
  tickets: Ticket[];
}

// Функция для загрузки данных CRM
function loadCrmData(): CrmData {
  if (!existsSync(CRM_DATA_PATH)) {
    // Создаем тестовые данные если файл не существует
    const initialData: CrmData = {
      users: [
        {
          id: "user-001",
          email: "ivan.petrov@example.com",
          name: "Иван Петров",
          status: "active",
          createdAt: "2024-01-15T10:00:00Z",
          lastLogin: "2024-12-20T14:30:00Z",
        },
        {
          id: "user-002",
          email: "maria.ivanova@example.com",
          name: "Мария Иванова",
          status: "active",
          createdAt: "2024-02-20T09:15:00Z",
          lastLogin: "2024-12-19T16:45:00Z",
        },
        {
          id: "user-003",
          email: "alex.sidorov@example.com",
          name: "Алексей Сидоров",
          status: "inactive",
          createdAt: "2024-03-10T11:30:00Z",
          lastLogin: "2024-11-15T10:20:00Z",
        },
      ],
      tickets: [
        {
          id: "ticket-001",
          userId: "user-001",
          title: "Проблема с авторизацией",
          description: "Не могу войти в систему. Получаю ошибку 'Invalid credentials' даже при правильном пароле.",
          status: "open",
          priority: "high",
          createdAt: "2024-12-20T10:00:00Z",
          updatedAt: "2024-12-20T10:00:00Z",
          tags: ["авторизация", "ошибка"],
        },
        {
          id: "ticket-002",
          userId: "user-002",
          title: "Вопрос по RAG поиску",
          description: "Как работает RAG поиск? Не могу найти нужную информацию в документации.",
          status: "in_progress",
          priority: "medium",
          createdAt: "2024-12-19T14:20:00Z",
          updatedAt: "2024-12-20T09:15:00Z",
          tags: ["rag", "документация"],
        },
        {
          id: "ticket-003",
          userId: "user-001",
          title: "Ошибка при индексации",
          description: "При запуске индексации получаю ошибку 'Index not found'. Как исправить?",
          status: "resolved",
          priority: "medium",
          createdAt: "2024-12-18T16:30:00Z",
          updatedAt: "2024-12-19T11:00:00Z",
          resolvedAt: "2024-12-19T11:00:00Z",
          tags: ["индексация", "ошибка"],
        },
        {
          id: "ticket-004",
          userId: "user-002",
          title: "Запрос на новую функцию",
          description: "Хотелось бы добавить возможность экспорта истории чатов в PDF.",
          status: "open",
          priority: "low",
          createdAt: "2024-12-20T12:00:00Z",
          updatedAt: "2024-12-20T12:00:00Z",
          tags: ["функция", "экспорт"],
        },
      ],
    };
    
    writeFileSync(CRM_DATA_PATH, JSON.stringify(initialData, null, 2), "utf-8");
    return initialData;
  }
  
  try {
    const data = readFileSync(CRM_DATA_PATH, "utf-8");
    return JSON.parse(data) as CrmData;
  } catch (error) {
    console.error("[MCP crm-server] Ошибка при загрузке данных:", error);
    return { users: [], tickets: [] };
  }
}

// Функция для сохранения данных CRM
function saveCrmData(data: CrmData): void {
  try {
    writeFileSync(CRM_DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("[MCP crm-server] Ошибка при сохранении данных:", error);
    throw new Error("Не удалось сохранить данные CRM");
  }
}

// Тул для поиска пользователя по email или ID
server.tool(
  "crm_get_user",
  {
    userId: z
      .string()
      .optional()
      .describe("ID пользователя для поиска"),
    email: z
      .string()
      .optional()
      .describe("Email пользователя для поиска"),
  },
  async ({ userId, email }) => {
    console.log("[MCP crm-server] Вызван crm_get_user с userId=", userId, "email=", email);

    const data = loadCrmData();

    let user: User | undefined;

    if (userId) {
      user = data.users.find((u) => u.id === userId);
    } else if (email) {
      user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    } else {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "Необходимо указать либо userId, либо email",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (!user) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "Пользователь не найден",
                userId,
                email,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(user, null, 2),
        },
      ],
    };
  }
);

// Тул для поиска тикетов
server.tool(
  "crm_search_tickets",
  {
    ticketId: z
      .string()
      .optional()
      .describe("ID тикета для поиска"),
    userId: z
      .string()
      .optional()
      .describe("ID пользователя для фильтрации тикетов"),
    status: z
      .enum(["open", "in_progress", "resolved", "closed"])
      .optional()
      .describe("Статус тикета для фильтрации"),
    priority: z
      .enum(["low", "medium", "high", "urgent"])
      .optional()
      .describe("Приоритет тикета для фильтрации"),
    searchText: z
      .string()
      .optional()
      .describe("Текст для поиска в заголовке и описании тикета"),
  },
  async ({ ticketId, userId, status, priority, searchText }) => {
    console.log("[MCP crm-server] Вызван crm_search_tickets с параметрами:", {
      ticketId,
      userId,
      status,
      priority,
      searchText,
    });

    const data = loadCrmData();
    let tickets = [...data.tickets];

    // Фильтрация по ID
    if (ticketId) {
      tickets = tickets.filter((t) => t.id === ticketId);
    }

    // Фильтрация по пользователю
    if (userId) {
      tickets = tickets.filter((t) => t.userId === userId);
    }

    // Фильтрация по статусу
    if (status) {
      tickets = tickets.filter((t) => t.status === status);
    }

    // Фильтрация по приоритету
    if (priority) {
      tickets = tickets.filter((t) => t.priority === priority);
    }

    // Поиск по тексту
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      tickets = tickets.filter(
        (t) =>
          t.title.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(searchLower)))
      );
    }

    // Сортируем по дате создания (новые сначала)
    tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: tickets.length,
              tickets: tickets,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Тул для создания нового тикета
server.tool(
  "crm_create_ticket",
  {
    userId: z.string().describe("ID пользователя, создающего тикет"),
    title: z.string().describe("Заголовок тикета"),
    description: z.string().describe("Описание проблемы или вопроса"),
    priority: z
      .enum(["low", "medium", "high", "urgent"])
      .optional()
      .describe("Приоритет тикета (по умолчанию medium)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Теги для тикета"),
  },
  async ({ userId, title, description, priority = "medium", tags = [] }) => {
    console.log("[MCP crm-server] Вызван crm_create_ticket для userId=", userId);

    const data = loadCrmData();

    // Проверяем существование пользователя
    const user = data.users.find((u) => u.id === userId);
    if (!user) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "Пользователь не найден",
                userId,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Генерируем новый ID тикета
    const ticketId = `ticket-${String(data.tickets.length + 1).padStart(3, "0")}`;
    const now = new Date().toISOString();

    const newTicket: Ticket = {
      id: ticketId,
      userId,
      title,
      description,
      status: "open",
      priority,
      createdAt: now,
      updatedAt: now,
      tags,
    };

    data.tickets.push(newTicket);
    saveCrmData(data);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              ticket: newTicket,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Тул для обновления статуса тикета
server.tool(
  "crm_update_ticket_status",
  {
    ticketId: z.string().describe("ID тикета для обновления"),
    status: z
      .enum(["open", "in_progress", "resolved", "closed"])
      .describe("Новый статус тикета"),
  },
  async ({ ticketId, status }) => {
    console.log("[MCP crm-server] Вызван crm_update_ticket_status для ticketId=", ticketId);

    const data = loadCrmData();
    const ticket = data.tickets.find((t) => t.id === ticketId);

    if (!ticket) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "Тикет не найден",
                ticketId,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();

    if (status === "resolved" || status === "closed") {
      ticket.resolvedAt = new Date().toISOString();
    }

    saveCrmData(data);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              ticket,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Тул для получения всех пользователей
server.tool(
  "crm_list_users",
  {
    status: z
      .enum(["active", "inactive", "suspended"])
      .optional()
      .describe("Фильтр по статусу пользователя"),
  },
  async ({ status }) => {
    console.log("[MCP crm-server] Вызван crm_list_users с status=", status);

    const data = loadCrmData();
    let users = [...data.users];

    if (status) {
      users = users.filter((u) => u.status === status);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: users.length,
              users: users,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  console.log("[MCP crm-server] Старт, ожидание соединения по stdio...");
  console.log(`[MCP crm-server] Путь к данным CRM: ${CRM_DATA_PATH}`);
  
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP crm-сервера:", error);
  process.exit(1);
});
