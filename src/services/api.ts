const BASE = 'http://127.0.0.1:8710/api';

export interface SourceInfo {
  key: string;
  name: string;
  domain: string;
  online: boolean;
  latency_ms: number;
}

export interface BookData {
  title: string;
  author: string;
  source_key: string;
  source_name: string;
  chapter_url: string;
  cover_url: string;
  word_count: number;
  score: string;
  status: string;
  description: string;
}

export interface SearchResponse {
  [sourceKey: string]: {
    [bookId: string]: BookData;
  };
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  title: string;
  total_chapters: number;
  completed_chapters: number;
}

export interface ChapterData {
  index: number;
  title: string;
  url: string;
  content: string;
}

export interface TaskResult {
  [sourceKey: string]: {
    [bookId: string]: {
      title: string;
      total_chapters: number;
      filepath: string;
      chapters: ChapterData[];
    };
  };
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function fetchSources(adult = false): Promise<{
  sources: SourceInfo[];
  default_output_dir: string;
}> {
  const res = await fetch(`${BASE}/sources${adult ? '?adult=true' : ''}`);
  return res.json();
}

export async function search(keyword: string, adult = false): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, adult }),
  });
  return res.json();
}

export async function submitDownload(
  sourceKey: string,
  book: BookData,
  adult = false,
  startChapter?: number,
  endChapter?: number,
  outputDir?: string
): Promise<{ task_id: string }> {
  const body: Record<string, unknown> = {
    source_key: sourceKey,
    book: {
      ...book,
      source: book.source_name || book.source_key,
    },
    adult,
  };
  if (startChapter !== undefined) body.start_chapter = startChapter;
  if (endChapter !== undefined) body.end_chapter = endChapter;
  if (outputDir) body.output_dir = outputDir;
  const res = await fetch(`${BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getTaskProgress(taskId: string): Promise<TaskStatus> {
  const res = await fetch(`${BASE}/tasks/${taskId}`);
  return res.json();
}

export async function getTaskResult(taskId: string): Promise<TaskResult> {
  const res = await fetch(`${BASE}/tasks/${taskId}/result`);
  return res.json();
}

export function createTaskSocket(taskId: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:8710/ws/download/${taskId}`);
}
