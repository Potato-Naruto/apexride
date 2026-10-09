import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LibraryEntry } from '../../shared/types';
import { filterLibrary, type LibraryQuery } from '../../shared/librarySearch';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(dir, '../data/library.seed.json');
const USER = path.join(dir, '../data/library.user.json');

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export async function allEntries(): Promise<LibraryEntry[]> {
  const [seed, user] = await Promise.all([readJson<LibraryEntry[]>(SEED, []), readJson<LibraryEntry[]>(USER, [])]);
  return [...seed, ...user];
}

export async function addEntry(e: LibraryEntry) {
  const user = await readJson<LibraryEntry[]>(USER, []);
  user.push(e);
  await fs.writeFile(USER, JSON.stringify(user, null, 2));
}

export type Query = LibraryQuery;

export async function search(f: Query): Promise<LibraryEntry[]> {
  return filterLibrary(await allEntries(), f);
}
