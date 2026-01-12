# Документация по планировщику задач

## Обзор

Планировщик задач позволяет автоматически выполнять задачи по расписанию с использованием cron выражений. Задачи могут использовать AI для выполнения сложных операций и отправлять результаты через различные каналы (Telegram, email и т.д.).

## Архитектура

### Компоненты

1. **Scheduler** (`src/lib/scheduler.ts`) - Основной модуль планировщика
2. **Tasks** (`src/lib/tasks/`) - Определения задач
3. **Scheduler Init** (`src/lib/scheduler-init.ts`) - Инициализация планировщика
4. **API Endpoint** (`src/app/api/scheduler/start/route.ts`) - API для управления

### Технологии

- **node-cron** - Библиотека для cron расписаний
- **TypeScript** - Типизированный код

## Типы задач

### ScheduledTask

```typescript
type ScheduledTask = {
  id: string;                    // Уникальный идентификатор
  name: string;                   // Название задачи
  description?: string;           // Описание задачи
  cronExpression: string;         // Cron выражение
  enabled: boolean;               // Включена ли задача
  execute: () => Promise<void>;  // Функция выполнения
};
```

## Создание задачи

### Шаг 1: Определение задачи

Создайте файл в `src/lib/tasks/my-task.ts`:

```typescript
import { ScheduledTask } from "../scheduler";
import { executeChatWithMCP } from "../chat-executor";
import { ChatMessage } from "@/types/chat";

export const myTask: ScheduledTask = {
  id: "my-task",
  name: "Моя задача",
  description: "Описание задачи",
  cronExpression: "0 9 * * *", // Каждый день в 9:00
  enabled: true,
  execute: async () => {
    try {
      // Логика задачи
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Мой запрос к AI",
        },
      ];

      const result = await executeChatWithMCP(
        messages,
        "mistralai/devstral-2512:free",
        1.0
      );

      console.log("[My Task] Результат:", result.message.content);
      
      // Дополнительная обработка результата
    } catch (error) {
      console.error("[My Task] Ошибка:", error);
      throw error;
    }
  },
};
```

### Шаг 2: Регистрация задачи

Добавьте задачу в `src/lib/tasks/index.ts`:

```typescript
import { registerTask } from "../scheduler";
import { myTask } from "./my-task";

// Регистрация задач
registerTask(myTask);
```

### Шаг 3: Инициализация

Задачи автоматически регистрируются при импорте `tasks/index.ts` в `scheduler-init.ts`:

```typescript
import "@/lib/tasks"; // Регистрирует все задачи
import { startScheduler } from "./scheduler";

startScheduler();
```

## Cron выражения

### Формат

```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └─── День недели (0-7, где 0 и 7 = воскресенье)
│ │ │ │ └───── Месяц (1-12)
│ │ │ └─────── День месяца (1-31)
│ │ └───────── Час (0-23)
│ └─────────── Минута (0-59)
└───────────── Секунда (0-59, опционально)
```

### Примеры

```typescript
"0 9 * * *"        // Каждый день в 9:00
"0 */2 * * *"      // Каждые 2 часа
"0 0 * * 1"        // Каждый понедельник в полночь
"*/15 * * * *"     // Каждые 15 минут
"0 9-17 * * 1-5"   // С 9:00 до 17:00, понедельник-пятница
"0 0 1 * *"        // Первое число каждого месяца в полночь
"55 * * * *"       // Каждый час в 55 минут
```

### Онлайн инструменты

- [Crontab Guru](https://crontab.guru/) - Визуальный редактор cron выражений
- [Cron Expression Generator](https://www.freeformatter.com/cron-expression-generator-quartz.html)

## Встроенные задачи

### Currency Task (`currency-task.ts`)

**Назначение**: Проверка курсов валют и отправка уведомлений

**Расписание**: Каждый час в 55 минут (`"55 * * * *"`)

**Функциональность**:
- Запрашивает у AI информацию о валютах
- Использует MCP инструмент `cbr_rates` для получения данных
- Отправляет результат в Telegram

**Настройка**:
```typescript
cronExpression: "55 * * * *", // Измените на нужное время
enabled: true,                 // Включить/выключить
```

## Использование AI в задачах

### Базовый пример

```typescript
import { executeChatWithMCP } from "../chat-executor";
import { ChatMessage } from "@/types/chat";

execute: async () => {
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: "Ваш запрос к AI",
    },
  ];

  const result = await executeChatWithMCP(
    messages,
    "mistralai/devstral-2512:free", // Модель
    1.0,                             // Temperature
    undefined                        // Max tokens
  );

  // Использование результата
  console.log(result.message.content);
  console.log("Использовано токенов:", result.usage);
  
  if (result.executedTools) {
    console.log("Использованы инструменты:", result.executedTools);
  }
}
```

### Использование MCP инструментов

AI автоматически использует доступные MCP инструменты:

```typescript
const messages: ChatMessage[] = [
  {
    role: "user",
    content: "Какая валюта больше всего выросла за сегодня?",
  },
];

// AI автоматически вызовет cbr_rates для получения данных
const result = await executeChatWithMCP(messages);
```

## Интеграция с внешними сервисами

### Telegram

```typescript
import { sendTelegramMessage } from "../telegram";

execute: async () => {
  const result = await executeChatWithMCP(messages);
  
  if (result.message.content) {
    await sendTelegramMessage(
      "USER_ID",                    // Telegram User ID
      `📊 <b>Заголовок</b>\n\n${result.message.content}`
    );
  }
}
```

**Настройка Telegram**:
1. Получите токен бота у [@BotFather](https://t.me/BotFather)
2. Добавьте в `.env.local`: `TELEGRAM_BOT_TOKEN=...`
3. Получите ваш User ID (можно использовать [@userinfobot](https://t.me/userinfobot))

### Email (пример)

```typescript
import nodemailer from "nodemailer";

execute: async () => {
  const result = await executeChatWithMCP(messages);
  
  const transporter = nodemailer.createTransport({
    // Настройки SMTP
  });
  
  await transporter.sendMail({
    to: "user@example.com",
    subject: "Результат задачи",
    text: result.message.content,
  });
}
```

## Управление задачами

### Включение/выключение

Измените `enabled` в определении задачи:

```typescript
export const myTask: ScheduledTask = {
  // ...
  enabled: false, // Отключить задачу
};
```

### Изменение расписания

Измените `cronExpression`:

```typescript
export const myTask: ScheduledTask = {
  // ...
  cronExpression: "0 10 * * *", // Изменить на 10:00
};
```

### Получение списка задач

```typescript
import { getTasks } from "@/lib/scheduler";

const tasks = getTasks();
console.log("Зарегистрированные задачи:", tasks);
```

## API управления

### Запуск планировщика

```bash
POST /api/scheduler/start
```

Запускает планировщик (обычно запускается автоматически при старте приложения).

## Логирование

Все задачи должны логировать свои действия:

```typescript
execute: async () => {
  console.log("[Task Name] Начало выполнения");
  
  try {
    // Логика задачи
    console.log("[Task Name] Успешное выполнение");
  } catch (error) {
    console.error("[Task Name] Ошибка:", error);
    throw error;
  }
}
```

## Обработка ошибок

### Рекомендуемый подход

```typescript
execute: async () => {
  try {
    // Основная логика
  } catch (error) {
    // Логирование ошибки
    console.error("[Task Name] Ошибка:", error);
    
    // Опционально: отправка уведомления об ошибке
    try {
      await sendTelegramMessage("USER_ID", `❌ Ошибка в задаче: ${error}`);
    } catch (notifyError) {
      console.error("[Task Name] Не удалось отправить уведомление:", notifyError);
    }
    
    // Пробрасываем ошибку для логирования планировщиком
    throw error;
  }
}
```

### Изоляция ошибок

Планировщик изолирует ошибки между задачами - ошибка в одной задаче не влияет на другие.

## Производительность

### Оптимизация

1. **Кэширование**: Кэшируйте результаты где возможно
2. **Асинхронность**: Используйте async/await для неблокирующих операций
3. **Таймауты**: Устанавливайте таймауты для долгих операций

### Мониторинг

Отслеживайте:
- Время выполнения задач
- Использование токенов
- Количество ошибок

## Примеры задач

### Пример 1: Ежедневный отчет

```typescript
export const dailyReport: ScheduledTask = {
  id: "daily-report",
  name: "Ежедневный отчет",
  cronExpression: "0 9 * * *", // Каждый день в 9:00
  enabled: true,
  execute: async () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "Создай краткий отчет о вчерашних событиях",
      },
    ];

    const result = await executeChatWithMCP(messages);
    await sendTelegramMessage("USER_ID", result.message.content);
  },
};
```

### Пример 2: Мониторинг

```typescript
export const monitoring: ScheduledTask = {
  id: "monitoring",
  name: "Мониторинг системы",
  cronExpression: "*/30 * * * *", // Каждые 30 минут
  enabled: true,
  execute: async () => {
    // Проверка состояния системы
    const status = await checkSystemStatus();
    
    if (status.hasIssues) {
      await sendTelegramMessage("USER_ID", `⚠️ Проблемы: ${status.issues}`);
    }
  },
};
```

### Пример 3: Агрегация данных

```typescript
export const dataAggregation: ScheduledTask = {
  id: "data-aggregation",
  name: "Агрегация данных",
  cronExpression: "0 0 * * *", // Каждый день в полночь
  enabled: true,
  execute: async () => {
    // Сбор данных
    const data = await collectData();
    
    // Анализ через AI
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: `Проанализируй следующие данные: ${JSON.stringify(data)}`,
      },
    ];
    
    const result = await executeChatWithMCP(messages);
    
    // Сохранение результатов
    await saveResults(result.message.content);
  },
};
```

## Решение проблем

### Задача не выполняется

1. Проверьте, что `enabled: true`
2. Проверьте правильность cron выражения
3. Проверьте логи на наличие ошибок
4. Убедитесь, что планировщик запущен

### Ошибки выполнения

1. Проверьте логи задачи
2. Убедитесь в правильности API ключей
3. Проверьте доступность внешних сервисов
4. Убедитесь в правильной обработке ошибок

### Задачи выполняются слишком часто/редко

1. Проверьте cron выражение
2. Убедитесь, что нет дублирования задач
3. Проверьте системное время

## Лучшие практики

1. **Идемпотентность**: Задачи должны быть безопасными для повторного выполнения
2. **Логирование**: Всегда логируйте важные события
3. **Обработка ошибок**: Правильно обрабатывайте и логируйте ошибки
4. **Тестирование**: Тестируйте задачи перед добавлением в production
5. **Документация**: Документируйте назначение и расписание задач

## Безопасность

1. **API ключи**: Храните ключи в переменных окружения
2. **Валидация**: Валидируйте все входные данные
3. **Ограничения**: Ограничивайте доступ к ресурсам
4. **Мониторинг**: Отслеживайте подозрительную активность
