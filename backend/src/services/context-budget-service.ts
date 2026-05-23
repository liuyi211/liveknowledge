import { getModelCapability } from './ai-provider.js';

export interface ContextBudget {
  total: number;
  reservedForOutput: number;
  profile: number;
  sessionSummary: number;
  longTermMemory: number;
  rag: number;
  recentMessages: number;
  attachments: number;
}

export function estimateTokens(value: string): number {
  return Math.ceil(value.length * 0.5);
}

export function allocateContextBudget(input: {
  model?: string | null;
  attachmentTexts?: string[];
  query?: string;
}): ContextBudget {
  const capability = input.model ? getModelCapability(input.model) : null;
  const total = Math.max(4096, capability?.contextWindow ?? 8192);
  const usable = Math.floor(total * 0.85);
  const reservedForOutput = Math.min(capability?.maxOutputTokens ?? 2048, Math.max(1024, Math.floor(total * 0.15)));
  const attachments = Math.min(
    Math.max(0, usable - reservedForOutput),
    estimateTokens((input.attachmentTexts || []).join('\n')) + estimateTokens(input.query || '')
  );

  if (total <= 8192) {
    return {
      total,
      reservedForOutput,
      profile: 400,
      sessionSummary: 800,
      longTermMemory: 700,
      rag: 1500,
      recentMessages: Math.max(1200, usable - reservedForOutput - attachments - 3400),
      attachments,
    };
  }

  if (total <= 32768) {
    return {
      total,
      reservedForOutput,
      profile: 600,
      sessionSummary: 1500,
      longTermMemory: 1500,
      rag: 4000,
      recentMessages: Math.max(6000, usable - reservedForOutput - attachments - 7600),
      attachments,
    };
  }

  return {
    total,
    reservedForOutput,
    profile: 800,
    sessionSummary: 3000,
    longTermMemory: 4000,
    rag: 12000,
    recentMessages: Math.max(12000, usable - reservedForOutput - attachments - 19800),
    attachments,
  };
}
