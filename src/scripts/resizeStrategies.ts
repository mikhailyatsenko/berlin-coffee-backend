// Примеры различных стратегий изменения размера для Sharp

import sharp from 'sharp';

// 1. ТЕКУЩАЯ СТРАТЕГИЯ: fit: 'inside' (сохраняет пропорции, помещается в рамки)
// 1920x1440 → 1440x1080 (пропорция 4:3 сохранена)
async function resizeInside(inputPath: string, outputPath: string) {
  await sharp(inputPath)
    .resize(1920, 1080, {
      fit: 'inside',           // Помещается в рамки, сохраняя пропорции
      withoutEnlargement: true // Не увеличивает маленькие изображения
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

// 2. СТРАТЕГИЯ: fit: 'cover' (заполняет рамки, обрезает лишнее)
// 1920x1440 → 1920x1080 (обрезается по высоте)
async function resizeCover(inputPath: string, outputPath: string) {
  await sharp(inputPath)
    .resize(1920, 1080, {
      fit: 'cover',            // Заполняет рамки, обрезает лишнее
      position: 'center'       // Центрирует при обрезке
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

// 3. СТРАТЕГИЯ: fit: 'fill' (растягивает до точных размеров)
// 1920x1440 → 1920x1080 (растягивается, искажает пропорции)
async function resizeFill(inputPath: string, outputPath: string) {
  await sharp(inputPath)
    .resize(1920, 1080, {
      fit: 'fill'              // Растягивает до точных размеров
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

// 4. СТРАТЕГИЯ: fit: 'contain' (как inside, но может увеличивать)
// 1920x1440 → 1440x1080 (если withoutEnlargement: true)
async function resizeContain(inputPath: string, outputPath: string) {
  await sharp(inputPath)
    .resize(1920, 1080, {
      fit: 'contain',          // Помещается в рамки, может увеличивать
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

// 5. СТРАТЕГИЯ: Только по ширине (высота автоматически)
// 1920x1440 → 1920x1440 (если ширина уже подходящая)
async function resizeWidthOnly(inputPath: string, outputPath: string) {
  await sharp(inputPath)
    .resize(1920, null, {      // null = автоматическая высота
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

// 6. СТРАТЕГИЯ: Только по высоте (ширина автоматически)
// 1920x1440 → 1440x1080
async function resizeHeightOnly(inputPath: string, outputPath: string) {
  await sharp(inputPath)
    .resize(null, 1080, {      // null = автоматическая ширина
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

// 7. СТРАТЕГИЯ: Умная обрезка с центрированием
// 1920x1440 → 1920x1080 (обрезает 180px сверху и снизу)
async function smartCrop(inputPath: string, outputPath: string) {
  await sharp(inputPath)
    .resize(1920, 1080, {
      fit: 'cover',
      position: 'center'       // Центрирует при обрезке
    })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

export {
  resizeInside,
  resizeCover,
  resizeFill,
  resizeContain,
  resizeWidthOnly,
  resizeHeightOnly,
  smartCrop
};
