// Simple in-memory cache utility
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class Cache {
  private cache = new Map<string, CacheItem<any>>();

  /**
   * Set cache item
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds (default: 5 minutes)
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Get cache item
   * @param key - Cache key
   * @returns Cached data or null if not found or expired
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * Delete cache item
   * @param key - Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clean expired items
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache by pattern
   * @param pattern - Pattern to match keys (e.g., 'places:', 'place:123:')
   */
  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`Invalidated ${keysToDelete.length} cache entries matching pattern: ${pattern}`);
  }

  /**
   * Invalidate all places cache
   */
  invalidatePlaces(): void {
    this.invalidatePattern('places:');
  }

  /**
   * Invalidate specific place cache
   * @param placeId - Place ID to invalidate
   */
  invalidatePlace(placeId: string): void {
    this.invalidatePattern(`place:${placeId}:`);
  }

  /**
   * Invalidate images cache for specific place
   * @param placeId - Place ID to invalidate images for
   */
  invalidateImages(placeId: string): void {
    this.invalidatePattern(`images:${placeId}`);
  }
}

// Export singleton instance
export const cache = new Cache();

// Clean expired items every 10 minutes
setInterval(() => {
  cache.cleanExpired();
}, 10 * 60 * 1000);
