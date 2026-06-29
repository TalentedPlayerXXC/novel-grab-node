import type { SearchResponse, BookData, ChapterData } from './api';

const SEARCH_PREFIX = 'novel-grab-search:';
const BOOK_PREFIX = 'novel-grab-book:';
const SEARCH_TTL = 30 * 60 * 1000;
const SEARCH_MAX = 20;
const BOOK_MAX = 30;

interface CacheEntry<T> {
  data: T;
  at: number;
}

export type CachedBook = {
  book: BookData;
  chapters: { index: number; title: string; url: string }[];
};

function read<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, at: Date.now() }));
  } catch {}
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function keysWithPrefix(prefix: string): string[] {
  const result: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) result.push(key);
    }
  } catch {}
  return result;
}

function evict(prefix: string, max: number) {
  const keys = keysWithPrefix(prefix)
    .map((k) => ({ key: k, entry: read<unknown>(k) }))
    .filter((k) => k.entry !== null) as { key: string; entry: CacheEntry<unknown> }[];
  keys.sort((a, b) => b.entry.at - a.entry.at);
  for (let i = max; i < keys.length; i++) {
    remove(keys[i].key);
  }
}

export function getCachedSearch(keyword: string): SearchResponse | null {
  const entry = read<SearchResponse>(`${SEARCH_PREFIX}${keyword}`);
  if (!entry) return null;
  if (Date.now() - entry.at > SEARCH_TTL) {
    remove(`${SEARCH_PREFIX}${keyword}`);
    return null;
  }
  return entry.data;
}

export function setCachedSearch(keyword: string, data: SearchResponse) {
  write(`${SEARCH_PREFIX}${keyword}`, data);
  evict(SEARCH_PREFIX, SEARCH_MAX);
}

export function getCachedBook(chapterUrl: string): CachedBook | null {
  const entry = read<CachedBook>(`${BOOK_PREFIX}${chapterUrl}`);
  if (!entry) return null;
  return entry.data;
}

export function setCachedBook(chapterUrl: string, book: BookData, chapters: { index: number; title: string; url: string }[]) {
  write(`${BOOK_PREFIX}${chapterUrl}`, { book, chapters });
  evict(BOOK_PREFIX, BOOK_MAX);
}

export function clearAllCaches() {
  for (const prefix of [SEARCH_PREFIX, BOOK_PREFIX]) {
    for (const key of keysWithPrefix(prefix)) {
      remove(key);
    }
  }
}

export function getCacheSize(): string {
  let bytes = 0;
  for (const prefix of [SEARCH_PREFIX, BOOK_PREFIX]) {
    for (const key of keysWithPrefix(prefix)) {
      try {
        bytes += (localStorage.getItem(key) || '').length * 2;
      } catch {}
    }
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
