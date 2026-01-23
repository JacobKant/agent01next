import { NextResponse } from "next/server";
import { listDataFiles } from "@/lib/data-parser";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "analyst");

export async function GET() {
  try {
    const files = listDataFiles(DATA_DIR);

    const fileInfo = files.map((filePath) => {
      const fileName = filePath.split(/[/\\]/).pop() || "";
      return {
        fileName,
        filePath,
      };
    });

    return NextResponse.json(
      {
        success: true,
        files: fileInfo,
        totalFiles: fileInfo.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Ошибка при получении списка файлов:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Неизвестная ошибка",
      },
      { status: 500 }
    );
  }
}
