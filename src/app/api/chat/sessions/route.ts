import { NextRequest, NextResponse } from "next/server";
import { getAllChats, getOrCreateChat, deleteChat } from "@/lib/db";

// GET - получить список всех чатов
export async function GET() {
  try {
    const chats = getAllChats();
    return NextResponse.json({ chats }, { status: 200 });
  } catch (error) {
    console.error("Ошибка GET /api/chat/sessions:", error);
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - создать новый чат
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatId }: { chatId?: string } = body;

    const chat = getOrCreateChat(chatId || `chat-${Date.now()}`);
    
    return NextResponse.json({ chat }, { status: 200 });
  } catch (error) {
    console.error("Ошибка POST /api/chat/sessions:", error);
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE - удалить чат
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId обязателен" },
        { status: 400 }
      );
    }

    deleteChat(chatId);
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
