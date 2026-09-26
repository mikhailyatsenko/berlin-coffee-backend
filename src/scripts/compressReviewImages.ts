import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CompressionOptions {
  quality: number;
  outputDir: string;
}

class ImageCompressor {
  private options: CompressionOptions;

  constructor(options: CompressionOptions) {
    this.options = options;
  }

  /**
   * Создает выходную директорию если она не существует
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Получает все файлы изображений в директории
   */
  private async getImageFiles(dirPath: string): Promise<string[]> {
    const files = await fs.readdir(dirPath);
    return files.filter(file =>
      file.toLowerCase().endsWith('.jpg') ||
      file.toLowerCase().endsWith('.jpeg') ||
      file.toLowerCase().endsWith('.png')
    );
  }

  /**
   * Обрабатывает одно изображение
   */
  private async processImage(
    inputPath: string,
    outputPath: string,
    index: number
  ): Promise<void> {
    try {
      const imageName = `image_${index + 1}.jpg`;
      const fullOutputPath = path.join(outputPath, imageName);

      console.log(`Processing: ${inputPath} -> ${fullOutputPath}`);

      await sharp(inputPath)
        .jpeg({
          quality: this.options.quality,
          progressive: true,
          mozjpeg: true,        // Использует mozjpeg для лучшего сжатия
          optimizeScans: true,  // Оптимизирует сканирование
          optimizeCoding: true  // Оптимизирует кодирование
        })
        .toFile(fullOutputPath);

      console.log(`✅ Processed: ${imageName}`);
    } catch (error) {
      console.error(`❌ Error processing ${inputPath}:`, error);
    }
  }

  /**
   * Обрабатывает все изображения в папке отзыва
   */
  private async processReviewFolder(
    reviewPath: string,
    outputReviewPath: string
  ): Promise<void> {
    await this.ensureDir(outputReviewPath);

    const imageFiles = await this.getImageFiles(reviewPath);

    // Сортируем файлы по времени создания для консистентного порядка
    const sortedFiles = imageFiles.sort();

    for (let i = 0; i < sortedFiles.length; i++) {
      const inputPath = path.join(reviewPath, sortedFiles[i]);
      await this.processImage(inputPath, outputReviewPath, i);
    }
  }

  /**
   * Обрабатывает все папки мест
   */
  private async processPlaceFolders(inputDir: string, outputDir: string): Promise<void> {
    const placeFolders = await fs.readdir(inputDir);

    for (const placeFolder of placeFolders) {
      const placePath = path.join(inputDir, placeFolder);
      const stat = await fs.stat(placePath);

      if (!stat.isDirectory()) continue;

      console.log(`\n🏢 Processing place: ${placeFolder}`);

      const outputPlacePath = path.join(outputDir, placeFolder);
      await this.ensureDir(outputPlacePath);

      // Получаем все папки отзывов в папке места
      const reviewFolders = await fs.readdir(placePath);

      for (const reviewFolder of reviewFolders) {
        const reviewPath = path.join(placePath, reviewFolder);
        const reviewStat = await fs.stat(reviewPath);

        if (!reviewStat.isDirectory()) continue;

        console.log(`  📝 Processing review: ${reviewFolder}`);

        const outputReviewPath = path.join(outputPlacePath, reviewFolder);
        await this.processReviewFolder(reviewPath, outputReviewPath);
      }
    }
  }

  /**
   * Основной метод для запуска сжатия
   */
  async compressImages(inputDir: string): Promise<void> {
    console.log('🚀 Starting image compression...');
    console.log(`📁 Input directory: ${inputDir}`);
    console.log(`📁 Output directory: ${this.options.outputDir}`);
    console.log(`⚙️  Quality: ${this.options.quality}%`);

    const startTime = Date.now();

    try {
      await this.processPlaceFolders(inputDir, this.options.outputDir);

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      console.log(`\n✅ Compression completed in ${duration.toFixed(2)}s`);
    } catch (error) {
      console.error('❌ Compression failed:', error);
      throw error;
    }
  }
}

// Конфигурация сжатия
const compressionOptions: CompressionOptions = {
  quality: 70,           // Качество JPEG (0-100) - более агрессивное сжатие
  outputDir: path.join(__dirname, '../../compressed-images')
};

// Запуск скрипта
async function main() {
  const inputDir = path.join(__dirname, '../../untracked');

  // Проверяем существование входной директории
  try {
    await fs.access(inputDir);
  } catch {
    console.error(`❌ Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  const compressor = new ImageCompressor(compressionOptions);
  await compressor.compressImages(inputDir);
}

// Запускаем только если файл выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ImageCompressor };
export type { CompressionOptions };
