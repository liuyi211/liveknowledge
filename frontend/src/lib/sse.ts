type SseEventHandler<T> = (event: T) => void | boolean | Promise<void | boolean>;

function parseSseEvent<T>(rawEvent: string): T | null {
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (!data) return null;
  return JSON.parse(data) as T;
}

async function parseResponseError(response: Response) {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;

  try {
    const data = JSON.parse(text);
    return data.message || data.error || `HTTP ${response.status}`;
  } catch {
    return text;
  }
}

export async function readSseStream<T>(
  response: Response,
  onEvent: SseEventHandler<T>,
  signal?: AbortSignal
) {
  if (!response.ok) {
    throw new Error(await parseResponseError(response));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (!signal?.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';

    for (const rawEvent of events) {
      const event = parseSseEvent<T>(rawEvent);
      if (!event) continue;

      const shouldContinue = await onEvent(event);
      if (shouldContinue === false) {
        return;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim() && !signal?.aborted) {
    const event = parseSseEvent<T>(buffer);
    if (event) {
      await onEvent(event);
    }
  }
}
