import { NextRequest, NextResponse } from "next/server";
import { loadMessages, saveMessage, getOrCreateChat } from "@/lib/db";

// GET - загрузить историю чата
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chatId = searchParams.get("chatId") || "default";
    
    const messages = loadMessages(chatId);
    
    return NextResponse.json({ messages }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - сохранить сообщение
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Логирование для отладки
    console.log("[history POST] Получено сообщение:", {
      chatId: body.chatId,
      messageId: body.message?.id,
      role: body.message?.role,
      hasContent: body.message?.content !== undefined,
      contentLength: body.message?.content?.length ?? 0,
      hasToolCalls: !!body.message?.tool_calls?.length,
      hasToolCallId: !!body.message?.tool_call_id,
    });
    
    const {
      chatId = "default",
      message,
    }: {
      chatId?: string;
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
      };
    } = body;

    // Валидация: сообщение должно иметь id и role
    if (!message || !message.id || !message.role) {
      return NextResponse.json(
        { error: "Некорректные данные сообщения: отсутствуют обязательные поля id или role" },
        { status: 400 }
      );
    }
    
    // Нормализуем content: если undefined или null, делаем пустой строкой
    // Это допустимо для сообщений с tool_calls или tool_call_id
    if (message.content === undefined || message.content === null) {
      message.content = "";
    }
    
    console.log("[history POST] После нормализации:", {
      messageId: message.id,
      role: message.role,
      content: message.content,
      contentLength: message.content?.length ?? 0,
      hasToolCalls: !!message.tool_calls?.length,
      toolCallsCount: message.tool_calls?.length ?? 0,
      hasToolCallId: !!message.tool_call_id,
    });
    
    // Проверяем, что есть хотя бы какое-то содержимое:
    // - tool_calls (для assistant сообщений с вызовами инструментов)
    // - tool_call_id (для tool сообщений с результатами)
    // - content (может быть пустой строкой, но должен быть определен)
    const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
    const hasToolCallId = message.tool_call_id !== undefined && message.tool_call_id !== null;
    
    // Если нет ни tool_calls, ни tool_call_id, то content должен быть определен (может быть пустой строкой)
    if (!hasToolCalls && !hasToolCallId && message.content === undefined) {
      return NextResponse.json(
        { error: "Некорректные данные сообщения: отсутствует content, tool_calls или tool_call_id" },
        { status: 400 }
      );
    }

    // Убеждаемся, что чат существует
    getOrCreateChat(chatId);
    
    // Сохраняем сообщение (всё содержимое идёт в JSON-колонку data)
    saveMessage(chatId, message);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
