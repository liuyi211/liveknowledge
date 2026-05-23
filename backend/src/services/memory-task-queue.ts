import type { FastifyBaseLogger } from 'fastify';

type MemoryTask = {
  name: string;
  run: () => Promise<void>;
  log?: Pick<FastifyBaseLogger, 'warn' | 'debug'>;
};

const queue: MemoryTask[] = [];
let running = false;

export function enqueueMemoryTask(task: MemoryTask): void {
  queue.push(task);
  task.log?.debug?.({ task: task.name, queued: queue.length }, 'Queued memory background task');
  if (!running) {
    setImmediate(processQueue);
  }
}

async function processQueue(): Promise<void> {
  if (running) return;
  running = true;

  try {
    while (queue.length > 0) {
      const task = queue.shift()!;
      try {
        await task.run();
        task.log?.debug?.({ task: task.name, remaining: queue.length }, 'Finished memory background task');
      } catch (err) {
        task.log?.warn?.({ err, task: task.name }, 'Memory background task failed');
      }
    }
  } finally {
    running = false;
  }
}
