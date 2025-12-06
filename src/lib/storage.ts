/**
 * Chrome-compatible storage adapter with fallback mechanisms
 * Handles Chrome mobile's strict storage policies gracefully
 */

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

class ChromeCompatibleStorage implements StorageAdapter {
  private memoryStorage: Map<string, string> = new Map();
  private isStorageAvailable: boolean = true;
  private isChromeMobile: boolean = false;

  constructor() {
    // Detect Chrome mobile
    this.isChromeMobile = this.detectChromeMobile();
    
    // Test storage availability
    this.testStorage();
  }

  private detectChromeMobile(): boolean {
    if (typeof window === 'undefined') return false;
    
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isChrome = /Chrome/i.test(ua) && !/Edge|Opera|OPR/i.test(ua);
    const isMobile = /Mobile|Android/i.test(ua);
    
    return isChrome && isMobile;
  }

  private testStorage(): void {
    try {
      const testKey = '__storage_test__';
      const testValue = 'test';
      
      // Test localStorage
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      
      if (retrieved !== testValue) {
        throw new Error('Storage test failed');
      }
      
      this.isStorageAvailable = true;
    } catch (error) {
      // Storage is blocked or unavailable
      this.isStorageAvailable = false;
      console.warn('[Storage] localStorage unavailable, using memory fallback:', error);
    }
  }

  getItem(key: string): string | null {
    try {
      if (this.isStorageAvailable) {
        return localStorage.getItem(key);
      }
    } catch (error) {
      console.warn('[Storage] Error reading from localStorage:', error);
      this.isStorageAvailable = false;
    }
    
    // Fallback to memory storage
    return this.memoryStorage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    try {
      if (this.isStorageAvailable) {
        localStorage.setItem(key, value);
        return;
      }
    } catch (error) {
      console.warn('[Storage] Error writing to localStorage:', error);
      this.isStorageAvailable = false;
    }
    
    // Fallback to memory storage
    this.memoryStorage.set(key, value);
    
    // Warn user if using memory storage (data will be lost on refresh)
    if (this.isChromeMobile && this.memoryStorage.size === 1) {
      console.warn('[Storage] Using memory storage - session will not persist across page reloads');
    }
  }

  removeItem(key: string): void {
    try {
      if (this.isStorageAvailable) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('[Storage] Error removing from localStorage:', error);
    }
    
    this.memoryStorage.delete(key);
  }

  clear(): void {
    try {
      if (this.isStorageAvailable) {
        localStorage.clear();
      }
    } catch (error) {
      console.warn('[Storage] Error clearing localStorage:', error);
    }
    
    this.memoryStorage.clear();
  }

  isAvailable(): boolean {
    return this.isStorageAvailable;
  }

  isUsingMemoryFallback(): boolean {
    return !this.isStorageAvailable;
  }
}

// Export singleton instance
export const chromeStorage = new ChromeCompatibleStorage();

// Export wrapper functions for compatibility
export const getStorageItem = (key: string): string | null => {
  return chromeStorage.getItem(key);
};

export const setStorageItem = (key: string, value: string): void => {
  chromeStorage.setItem(key, value);
};

export const removeStorageItem = (key: string): void => {
  chromeStorage.removeItem(key);
};

export const clearStorage = (): void => {
  chromeStorage.clear();
};

export const isStorageAvailable = (): boolean => {
  return chromeStorage.isAvailable();
};

