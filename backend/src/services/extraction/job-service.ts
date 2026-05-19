import { db } from '../../db/index.js';
import { extractionJobs } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export async function createJob(
  userId: string,
  sourceType: string,
  sourceId: string,
  config?: Record<string, unknown>
): Promise<string> {
  const [result] = await db.insert(extractionJobs).values({
    userId,
    sourceType: sourceType as any,
    sourceId,
    status: 'pending',
    userFeedback: config ? { config } : undefined,
  }).returning({ id: extractionJobs.id });

  return result.id;
}

export async function getJob(jobId: string): Promise<any> {
  const [result] = await db.select().from(extractionJobs)
    .where(eq(extractionJobs.id, jobId))
    .limit(1);
  return result || null;
}

export async function updateJobStatus(
  jobId: string,
  status: string,
  currentStep?: string,
  logs?: any[],
  output?: any,
  error?: string
): Promise<void> {
  const updates: any = { status };
  if (currentStep !== undefined) updates.currentStep = currentStep;
  if (logs !== undefined) updates.logs = logs;
  if (output !== undefined) updates.output = output;
  if (error !== undefined) updates.error = error;
  if (status === 'completed' || status === 'failed') updates.completedAt = new Date();

  await db.update(extractionJobs).set(updates).where(eq(extractionJobs.id, jobId));
}
