'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Sparkles } from 'lucide-react';

interface Props {
  sourceType: string;
  sourceId: string;
  onComplete?: (job: any) => void;
  variant?: 'button' | 'menu';
}

export default function ExtractionButton({ sourceType, sourceId, onComplete, variant = 'button' }: Props) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'done'>('idle');

  const handleExtract = async () => {
    if (status === 'processing') return;
    setStatus('processing');
    try {
      const { jobId } = await api.extraction.createJob(sourceType, sourceId);

      const interval = setInterval(async () => {
        try {
          const job = await api.extraction.getJob(jobId);
          if (['completed', 'failed'].includes(job.status)) {
            clearInterval(interval);
            setStatus('done');
            onComplete?.(job);
          }
        } catch {
          clearInterval(interval);
          setStatus('idle');
        }
      }, 1500);
    } catch {
      setStatus('idle');
    }
  };

  if (variant === 'menu') {
    return (
      <button onClick={handleExtract} disabled={status === 'processing'}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
      >
        {status === 'processing' ? '提炼中...' : '✨ 提炼知识'}
      </button>
    );
  }

  return (
    <button onClick={handleExtract} disabled={status === 'processing'}
      className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition"
    >
      <Sparkles size={12} />
      {status === 'processing' ? '提炼中...' : status === 'done' ? '✓ 提炼完成' : '提炼知识'}
    </button>
  );
}
