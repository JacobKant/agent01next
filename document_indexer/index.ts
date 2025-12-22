import fs from 'fs';
import { pipeline } from '@xenova/transformers';

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

// Функция для вычисления схожести векторов (Cosine Similarity)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let mA = 0;
    let mB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        mA += vecA[i] * vecA[i];
        mB += vecB[i] * vecB[i];
    }
    const similarity = dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
    return isNaN(similarity) ? 0 : similarity;
}

// Улучшенная функция поиска с контекстом
function search(queryVector: number[], index: Array<{vector: number[], text: string, startPos: number, endPos: number}>, topK: number = 3) {
    const results = index
        .map((item, idx) => ({
            ...item,
            score: cosineSimilarity(queryVector, item.vector),
            index: idx
        }))
        .filter(item => item.score > 0.1) // Фильтруем слишком нерелевантные результаты
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    
    // Добавляем контекст: соседние чанки
    return results.map(result => {
        const contextChunks = [];
        
        // Предыдущий чанк
        if (result.index > 0) {
            contextChunks.push(index[result.index - 1].text);
        }
        
        // Основной чанк
        contextChunks.push(result.text);
        
        // Следующий чанк
        if (result.index < index.length - 1) {
            contextChunks.push(index[result.index + 1].text);
        }
        
        return {
            ...result,
            textWithContext: contextChunks.join('\n\n--- --- ---\n\n')
        };
    });
}

async function runPipeline() {
    console.log("📦 Загрузка локальной модели эмбеддингов...");
    // Используем одну из лучших компактных моделей: Xenova/all-MiniLM-L6-v2
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    // Читаем и предобрабатываем документ
    console.log("📄 Чтение и предобработка документа...");
    const rawText = fs.readFileSync('data/vpKnigaOborotnya.txt', 'utf-8');
    const preprocessedText = preprocessText(rawText);
    
    // Улучшенное разделение на чанки
    const chunks = splitText(preprocessedText, 1200, 200); // Увеличили размер чанка и перекрытие
    console.log(`✂️ Текст разбит на ${chunks.length} чанков (размер: 1200 символов, перекрытие: 200)`);

    // Генерируем эмбеддинги
    console.log("🧠 Генерация эмбеддингов...");
    const embeddings: number[][] = [];
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
            const output = await extractor(chunk.text, { pooling: 'mean', normalize: true });
            embeddings.push(Array.from(output.data as Float32Array));
            
            if ((i + 1) % 10 === 0) {
                console.log(`Прогресс: обработано ${i + 1} из ${chunks.length} чанков.`);
            }
        } catch (error) {
            console.error(`Ошибка при обработке чанка ${i}:`, error);
            // Создаем пустой эмбеддинг как fallback
            embeddings.push(new Array(384).fill(0)); // Размерность модели all-MiniLM-L6-v2
        }
    }

    // Создаем улучшенный индекс
    const index = chunks.map((chunk, i) => ({
        vector: embeddings[i],
        text: chunk.text,
        startPos: chunk.startPos,
        endPos: chunk.endPos
    }));

    // Сохраняем улучшенный индекс
    fs.writeFileSync('index.json', JSON.stringify(index));
    fs.writeFileSync('metadata.json', JSON.stringify(chunks));
    
    console.log("✅ Улучшенный индекс создан (index.json + metadata.json)");
    console.log(`📊 Статистика:`);
    console.log(`   - Всего чанков: ${chunks.length}`);
    console.log(`   - Средний размер чанка: ${Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length)} символов`);
    console.log(`   - Размер файла индекса: ${Math.round(fs.statSync('index.json').size / 1024 / 1024 * 100) / 100} МБ`);
}

runPipeline().catch(console.error);