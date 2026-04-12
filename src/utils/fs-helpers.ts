import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

export async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath);
  return JSON.parse(content) as T;
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

export async function listFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listFiles(fullPath);
      results.push(...subFiles);
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function cleanDir(dir: string): Promise<void> {
  if (await fileExists(dir)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  await ensureDir(dir);
}
