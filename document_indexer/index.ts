import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LocalIndex } from 'vectra';
import { getEmbedding } from './embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Улучшенная функция предобработки текста
function preprocessText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')  // Нормализация переносов строк
        .replace(/\n{3,}/g, '\n\n')  // Убираем избыточные переносы
        .replace(/\s{2,}/g, ' ')  // Убираем лишние пробелы
        .trim();
}

// Улучшенный сплиттер по предложениям и абзацам
function splitText(text: string, chunkSize: number, overlap: number): Array<{text: string, startPos: number, endPos: number}> {
    const chunks: Array<{text: string, startPos: number, endPos: number}> = [];
    
    // Если текст короче чем размер чанка, возвращаем как есть
    if (text.length <= chunkSize) {
        return [{
            text: text.trim(),
            startPos: 0,
            endPos: text.length
        }];
    }
    
    // Разбиваем текст на предложения для лучшего контроля
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    let chunkStartPos = 0;
    let currentPos = 0;
    
    for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (!cleanSentence) continue;
        
        // Если добавление предложения превысит размер чанка
        if (currentChunk.length + cleanSentence.length > chunkSize && currentChunk.length > 0) {
            // Сохраняем текущий чанк
            chunks.push({
                text: currentChunk.trim(),
                startPos: chunkStartPos,
                endPos: chunkStartPos + currentChunk.length
            });
            
            // Начинаем новый чанк с перекрытием
            const words = currentChunk.split(/\s+/);
            const overlapWords = words.slice(-Math.floor(overlap / 10)); // Примерно overlap символов
            const overlapText = overlapWords.join(' ');
            
            currentChunk = overlapText + ' ' + cleanSentence;
            chunkStartPos = chunkStartPos + currentChunk.length - overlapText.length - cleanSentence.length - 1;
        } else {
            // Добавляем предложение к текущему чанку
            if (currentChunk.length > 0) {
                currentChunk += ' ' + cleanSentence;
            } else {
                currentChunk = cleanSentence;
                chunkStartPos = currentPos;
            }
        }
        
        currentPos += cleanSentence.length + 1; // +1 для пробела
    }
    
    // Добавляем последний чанк
    if (currentChunk.trim().length > 0) {
        chunks.push({
            text: currentChunk.trim(),
            startPos: chunkStartPos,
            endPos: currentPos
        });
    }
    
    return chunks;
}

async function runPipeline() {
    console.log("📦 Инициализация Vectra индекса...");
    
    // Инициализируем индекс Vectra
    const indexPath = path.join(__dirname, 'vectra_index');
    const index = new LocalIndex(indexPath);

    // Создаем индекс если его нет
    if (!(await index.isIndexCreated())) {
        console.log("📁 Создание нового индекса...");
        await index.createIndex();
    } else {
        // Получаем количество элементов через listItems
        const items = await index.listItems();
        const existingCount = items.length;
        console.log(`📁 Использование существующего индекса (содержит ${existingCount} документов)...`);
        console.log("⚠️  Внимание: новые документы будут добавлены к существующим.");
    }

    // Читаем и предобрабатываем документ
    console.log("📄 Чтение и предобработка документа...");
    const dataPath = path.join(__dirname, 'data', 'vpKnigaOborotnya.txt');
    
    if (!fs.existsSync(dataPath)) {
        throw new Error(`Файл не найден: ${dataPath}`);
    }
    
    const rawText = fs.readFileSync(dataPath, 'utf-8');
    const preprocessedText = preprocessText(rawText);
    
    // Улучшенное разделение на чанки
    const chunks = splitText(preprocessedText, 1200, 200);
    console.log(`✂️ Текст разбит на ${chunks.length} чанков (размер: 1200 символов, перекрытие: 200)`);

    // Генерируем эмбеддинги и добавляем в индекс
    console.log("🧠 Генерация эмбеддингов через OpenRouter API...");
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
            console.log(`Обработка чанка ${i + 1}/${chunks.length}...`);
            
            // Получаем эмбеддинг через OpenRouter API
            const embedding = await getEmbedding(chunk.text);
            
            // Добавляем в индекс Vectra
            await index.insertItem({
                vector: embedding,
                metadata: {
                    text: chunk.text,
                    startPos: chunk.startPos,
                    endPos: chunk.endPos,
                    chunkIndex: i,
                    documentPath: dataPath
                }
            });
            
            processedCount++;
            
            // Небольшая задержка чтобы не перегружать API
            if ((i + 1) % 10 === 0) {
                console.log(`Прогресс: обработано ${i + 1} из ${chunks.length} чанков.`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда задержки каждые 10 чанков
            }
        } catch (error) {
            console.error(`Ошибка при обработке чанка ${i + 1}:`, error);
            errorCount++;
        }
    }
    
    console.log("\n✅ Индексация завершена!");
    console.log(`📊 Статистика:`);
    console.log(`   - Всего чанков: ${chunks.length}`);
    console.log(`   - Успешно обработано: ${processedCount}`);
    console.log(`   - Ошибок: ${errorCount}`);
    console.log(`   - Средний размер чанка: ${Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length)} символов`);
    console.log(`   - Индекс сохранен в: ${indexPath}`);
}

runPipeline().catch(console.error);
