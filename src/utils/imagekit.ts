import ImageKit from "imagekit";
import { IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT } from "../config/env.js";
import { cache } from "./cache.js";

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
