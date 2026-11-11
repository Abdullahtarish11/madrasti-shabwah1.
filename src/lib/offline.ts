import type { Book } from '../../shared/types';

const CACHE = 'madrasti-books-v1';
const INDEX_KEY = 'madrasti.offline.books';

export interface SavedBook {
  id: string;
  title: string;
  url: string;
  sizeKb: number;
  savedAt: string;
}

function readIndex(): SavedBook[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as SavedBook[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SavedBook[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function listSavedBooks(): SavedBook[] {
  return readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function isBookSaved(id: string): Promise<boolean> {
  return readIndex().some((book) => book.id === id);
}

/** Downloads a book file into the Cache API so it opens without internet. */
export async function saveBookOffline(book: Book): Promise<void> {
  if (!('caches' in window)) throw new Error('متصفحك لا يدعم الحفظ دون إنترنت');
  const response = await fetch(book.fileUrl, { credentials: 'include' });
  if (!response.ok) throw new Error('تعذّر تنزيل الملف من الخادم');
  const cache = await caches.open(CACHE);
  await cache.put(book.fileUrl, response.clone());
  const blob = await response.blob();
  const index = readIndex().filter((item) => item.id !== book.id);
  index.push({
    id: book.id,
    title: book.title,
    url: book.fileUrl,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
    savedAt: new Date().toISOString(),
  });
  writeIndex(index);
}

export async function getSavedBookUrl(bookId: string): Promise<string | null> {
  const item = readIndex().find((book) => book.id === bookId);
  if (!item) return null;
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(item.url);
  if (!cached) return null;
  const blob = await cached.blob();
  return URL.createObjectURL(blob);
}

export async function removeBookOffline(bookId: string): Promise<void> {
  const item = readIndex().find((book) => book.id === bookId);
  if (item && 'caches' in window) {
    const cache = await caches.open(CACHE);
    await cache.delete(item.url);
  }
  writeIndex(readIndex().filter((book) => book.id !== bookId));
}

export function offlineSizeKb(): number {
  return readIndex().reduce((total, book) => total + book.sizeKb, 0);
}
