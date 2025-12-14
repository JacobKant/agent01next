import { NextRequest, NextResponse } from "next/server";
import { loadMessages, saveMessage, getAllChats, getOrCreateChat } from "@/lib/db";

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
      };
    } = body;

    if (!message || !message.id || !message.role || !message.content) {
      return NextResponse.json(
        { error: "Некорректные данные сообщения" },
        { status: 400 }
      );
    }

    // Убеждаемся, что чат существует
    getOrCreateChat(chatId);
    
    // Сохраняем сообщение
    saveMessage(chatId, message);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
