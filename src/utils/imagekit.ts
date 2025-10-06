import ImageKit from "imagekit";
import sharp from "sharp";
import { IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT } from "../config/env.js";

// Инициализация ImageKit
const imagekit = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY!,
  privateKey: IMAGEKIT_PRIVATE_KEY!,
  urlEndpoint: IMAGEKIT_URL_ENDPOINT!, 
});

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 50; // 50ms between requests (20 requests per second)

/**
 * Function for delay between requests
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gets list of files from places-main-img/[placeId] folder
 * @param placeId - Place ID
 * @returns Promise<string[]> - Array of file names
 */
export async function getPlaceImages(placeId: string): Promise<string[]> {
  try {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    const folderPath = `places-main-img/${placeId}`;
    
    const result = await imagekit.listFiles({
      path: folderPath,
    });

    // Extract only file names from full paths
    const filePath = result
      .filter(file => file.type === "file") // Only files, not folders
      .map(file => {
        // Remove folder path from file name
        const fullPath = (file as any).filePath;
        return fullPath;
      });

    return filePath;
  } catch (error) {
    console.error(`Error fetching images for place ${placeId}:`, error);
    // Return empty array in case of error
    return [];
  }
}

/**
 * Uploads avatar to ImageKit with resizing and compression
 * @param fileBuffer - File buffer
 * @param fileName - File name
 * @param userId - User ID
 * @returns Promise<string> - ImageKit file ID
 */
export async function uploadAvatar(
  fileBuffer: Buffer,
  userId: string
): Promise<string> {
  try {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    // Process image with Sharp: resize to 640px max dimension and convert to JPEG
    const processedBuffer = await sharp(fileBuffer)
      .resize(640, 640, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: 85,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    const result = await imagekit.upload({
      file: processedBuffer,
      fileName: `avatar-${userId}.jpeg`,
      folder: `3welle/avatars/${userId}`,
      useUniqueFileName: false
    });
    
    // Return filePath instead of fileId for compatibility
    return result.filePath;
  } catch (error) {
    console.error('Error uploading avatar to ImageKit:', error);
    throw new Error('Failed to upload avatar to ImageKit');
  }
}

/**
 * Deletes avatar from ImageKit
 * @param fileId - ImageKit file ID
 * @returns Promise<boolean> - Success status
 */
export async function deleteAvatar(filePath: string): Promise<boolean> {
  try {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();


    
    // First, get the fileId from filePath
    const files = await imagekit.listFiles({
      path: filePath.substring(0, filePath.lastIndexOf('/'))
    });


    
    const file = files.find(item => 
      item.type === 'file' && item.filePath === filePath
    );
    if (!file) {

      return true; // File doesn't exist, consider it deleted
    }
    
    const fileId = (file as any).fileId;

    
    await imagekit.deleteFile(fileId);

    return true;
  } catch (error) {
    console.error('Error deleting avatar from ImageKit:', {
      filePath,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

/**
 * Gets image URL from ImageKit
 * @param filePath - File path in ImageKit
 * @param transformations - Optional image transformations
 * @returns string - Image URL
 */
export function getImageUrl(
  filePath: string, 
  transformations?: any[]
): string {
  return imagekit.url({
    path: filePath,
    transformation: transformations,
  });
}

/**
 * Gets avatar URL from ImageKit file ID
 * @param fileId - ImageKit file ID
 * @param transformations - Optional image transformations
 * @returns string - Avatar URL
 */
export function getAvatarUrl(
  fileId: string,
  transformations?: any[]
): string {
  return imagekit.url({
    path: fileId,
    transformation: transformations,
  });
}
