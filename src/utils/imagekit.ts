import ImageKit from "imagekit";
import type { FileObject, FolderObject } from "imagekit/dist/libs/interfaces";
import sharp from "sharp";
import {
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_URL_ENDPOINT,
} from "../config/env.js";

// Инициализация ImageKit
const imagekit = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY!,
  privateKey: IMAGEKIT_PRIVATE_KEY!,
  urlEndpoint: IMAGEKIT_URL_ENDPOINT!,
});

/** listFiles returns folders too; this keeps only the files. */
const isFile = (item: FileObject | FolderObject): item is FileObject =>
  item.type === "file";

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 50; // 50ms between requests (20 requests per second)

/**
 * An upload we stopped waiting for. It may still land later: `settled`
 * resolves once the abandoned request has actually finished, either way.
 */
export class UploadTimeoutError extends Error {
  constructor(
    message: string,
    readonly settled: Promise<void>,
  ) {
    super(message);
    this.name = "UploadTimeoutError";
  }
}

/**
 * Stops waiting for a promise after `ms`. The ImageKit SDK (axios underneath)
 * has no timeout or abort option, so the request itself cannot be cancelled;
 * it is only abandoned, and the UploadTimeoutError says when it is really over.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new UploadTimeoutError(
            `${what} timed out after ${ms} ms`,
            promise.then(
              () => {},
              () => {},
            ),
          ),
        ),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Function for delay between requests
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Full paths of the files; folders are skipped
    const filePath = result.filter(isFile).map((file) => file.filePath);

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
  userId: string,
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
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();

    const result = await imagekit.upload({
      file: processedBuffer,
      fileName: `avatar-${userId}.jpeg`,
      folder: `3welle/avatars/${userId}`,
      useUniqueFileName: false,
    });

    // Return filePath instead of fileId for compatibility
    return result.filePath;
  } catch (error) {
    console.error("Error uploading avatar to ImageKit:", error);
    throw new Error("Failed to upload avatar to ImageKit");
  }
}

/**
 * Uploads a single Photo of a Review to ImageKit.
 *
 * The folder and the file name are built here, on the server: the client-side
 * upload signature cannot be scoped to a path, so the only way to keep review
 * images inside their own folder is to never let the client pick it.
 *
 * File names must stay `image_1.jpg`, `image_2.jpg`, ... — the frontend derives
 * review image URLs from the stored counter (see getReviewImages.ts).
 *
 * The rate-limit wait and the resize run on the clock of `deadline`, not
 * before it: the caller's lease is measured from the same moment, so time
 * spent here cannot eat into the margin the lease keeps past the timeout.
 * Once the deadline has passed, ImageKit is not called at all.
 *
 * @param fileBuffer - Decoded file buffer
 * @param placeId - Place the review belongs to
 * @param reviewId - Interaction id of the review
 * @param index - 1-based position of the image within the review
 * @param deadline - When the ImageKit call is abandoned
 * @returns Promise<string> - ImageKit file path
 */
export async function uploadReviewImage(
  fileBuffer: Buffer,
  placeId: string,
  reviewId: string,
  index: number,
  deadline: Date,
): Promise<string> {
  try {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    const processedBuffer = await sharp(fileBuffer)
      .resize(1440, 1440, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 82,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();

    const remainingMs = deadline.getTime() - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `Processing image_${index}.jpg used up the upload timeout before ImageKit was called`,
      );
    }

    const result = await withTimeout(
      imagekit.upload({
        file: processedBuffer,
        fileName: `image_${index}.jpg`,
        folder: `3welle/review-images/${placeId}/${reviewId}`,
        useUniqueFileName: false,
      }),
      remainingMs,
      `ImageKit upload of image_${index}.jpg`,
    );

    return result.filePath;
  } catch (error) {
    console.error("Error uploading review image to ImageKit:", error);
    // The caller needs to know when an abandoned upload is really over.
    if (error instanceof UploadTimeoutError) throw error;
    throw new Error("Failed to upload review image to ImageKit");
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
      path: filePath.substring(0, filePath.lastIndexOf("/")),
    });

    const file = files.find(
      (item): item is FileObject => isFile(item) && item.filePath === filePath,
    );
    if (!file) {
      return true; // File doesn't exist, consider it deleted
    }

    await imagekit.deleteFile(file.fileId);

    return true;
  } catch (error) {
    console.error("Error deleting avatar from ImageKit:", {
      filePath,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

export async function deleteAllReviewImages(
  folderPath: string,
): Promise<boolean> {
  try {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    await imagekit.deleteFolder(folderPath);
    return true;
  } catch (error) {
    console.error("Error deleting folder from ImageKit:", {
      folderPath,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}
