import path from 'path';
import { fileURLToPath } from 'url';
import { LocalIndex } from 'vectra';
import { getEmbedding } from './embeddings.js';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Функция для чтения ввода из консоли
function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function searchRAG(query?: string) {
    console.log("🔍 Инициализация RAG поиска...");
    
    // Инициализируем индекс Vectra
    const indexPath = path.join(__dirname, 'vectra_index');
    const index = new LocalIndex(indexPath);

    // Проверяем существование индекса
    if (!(await index.isIndexCreated())) {
        throw new Error(`Индекс не найден в ${indexPath}. Сначала запустите индексацию: npm start`);
    }

    // Получаем количество элементов через listItems
    const items = await index.listItems();
    const itemCount = items.length;
    console.log(`📊 Найдено ${itemCount} документов в индексе\n`);

    // Получаем запрос от пользователя или из аргументов командной строки
    let searchQuery = query;
    if (!searchQuery || !searchQuery.trim()) {
        searchQuery = await askQuestion("Введите поисковый запрос: ");
    }
    
    if (!searchQuery.trim()) {
        console.log("Запрос пуст. Выход.");
        process.exit(0);
    }

    console.log("\n🧠 Генерация эмбеддинга для запроса...");
    
    try {
        // Получаем эмбеддинг запроса
        const queryEmbedding = await getEmbedding(searchQuery);
        
        console.log("🔎 Поиск релевантных документов...\n");
        
        // Ищем топ-5 наиболее релевантных документов
        const topK = 5;
        const allResults = await index.queryItems(queryEmbedding, topK);
        
        // Ограничиваем результаты до topK на случай, если метод вернул больше
        const results = allResults.slice(0, topK);
        
        if (results.length === 0) {
            console.log("❌ Релевантные документы не найдены.");
            return;
        }
        
        console.log(`✅ Найдено ${results.length} наиболее релевантных документов:\n`);
        console.log("=".repeat(80));
        
        results.forEach((result, index) => {
            console.log(`\n📄 Результат #${index + 1} (релевантность: ${(result.score * 100).toFixed(2)}%)`);
            console.log("-".repeat(80));
            console.log(`Текст:`);
            console.log(result.item.metadata.text);
            console.log(`\nМетаданные:`);
            console.log(`  - Позиция в документе: ${result.item.metadata.startPos} - ${result.item.metadata.endPos}`);
            console.log(`  - Индекс чанка: ${result.item.metadata.chunkIndex}`);
            console.log(`  - Путь к документу: ${result.item.metadata.documentPath}`);
            console.log("=".repeat(80));
        });
        
        // Выводим контекст для использования в RAG
        console.log("\n📝 Контекст для RAG (топ-3 результата):\n");
        const top3Results = results.slice(0, 3);
        const context = top3Results
            .map((result, idx) => `[Документ ${idx + 1}, релевантность: ${(result.score * 100).toFixed(2)}%]\n${result.item.metadata.text}`)
            .join('\n\n--- --- ---\n\n');
        console.log(context);
        
    } catch (error) {
        console.error("❌ Ошибка при выполнении поиска:", error);
        process.exit(1);
    }
}

// Запускаем поиск
// Поддерживаем аргумент командной строки для запроса
const queryArg = process.argv[2];
searchRAG(queryArg).catch(console.error);
