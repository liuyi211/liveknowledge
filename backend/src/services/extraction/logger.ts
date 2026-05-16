import type { FastifyBaseLogger } from 'fastify';

export class JobLogger {
  constructor(private log: FastifyBaseLogger, private jobId: string) {}

  step(step: string, status: 'started' | 'completed' | 'failed', detail?: object) {
    const duration = detail?.['durationMs'] as number | undefined;
    this.log.info(
      { jobId: this.jobId, step, status, ...detail },
      `Job[${this.jobId}] ${step} ${status}${duration ? ` (${duration}ms)` : ''}`
    );
  }

  debug(step: string, detail: object) {
    this.log.debug({ jobId: this.jobId, step, ...detail }, `Job[${this.jobId}] ${step}`);
  }

  error(step: string, err: Error) {
    this.log.error({ jobId: this.jobId, step, err }, `Job[${this.jobId}] ${step} FAILED`);
  }
}
