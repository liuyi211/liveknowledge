'use client';

import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Sparkles } from 'lucide-react';
import TaskProgressDrawer from '../progress/TaskProgressDrawer';
import ExtractionPanel from './ExtractionPanel';
import { useTaskProgress } from '../progress/useTaskProgress';
import { EXTRACTION_STEPS } from '../progress/types';

interface Props {
  sourceType: string;
  sourceId: string;
  onComplete?: (job: any) => void;
  variant?: 'button' | 'menu';
}

export default function ExtractionButton({ sourceType, sourceId, onComplete, variant = 'button' }: Props) {
  const [showProgress, setShowProgress] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [job, setJob] = useState<any>(null);
  const jobIdRef = useRef<string | null>(null);

  const extractionProgress = useTaskProgress(
    async () => {
      if (!jobIdRef.current) throw new Error('No job');
      return api.extraction.getJob(jobIdRef.current);
    },
    (status) => ['completed', 'failed'].includes(status),
    {
      onComplete: () => {
        if (jobIdRef.current) {
          api.extraction.getJob(jobIdRef.current).then((fullJob) => {
            setJob(fullJob);
            setShowProgress(false);
            setShowResult(true);
            onComplete?.(fullJob);
          });
        }
      },
      onFailed: () => {
        if (jobIdRef.current) {
          api.extraction.getJob(jobIdRef.current).then((fullJob) => {
            setJob(fullJob);
          });
        }
      },
    }
  );

  const handleExtract = async () => {
    // If already extracting, just show the progress drawer
    if (extractionProgress.isPolling) {
      setShowProgress(true);
      return;
    }
    try {
      const { jobId } = await api.extraction.createJob(sourceType, sourceId);
      jobIdRef.current = jobId;
      setShowProgress(true);
      extractionProgress.startPolling();
    } catch {
      // Error handled by hook
    }
  };

  if (variant === 'menu') {
    return (
      <>
        <button
          onClick={handleExtract}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
        >
          {extractionProgress.isPolling ? '提炼中... (点击查看进度)' : '✨ 提炼知识'}
        </button>

        <TaskProgressDrawer
          isOpen={showProgress}
          onClose={() => setShowProgress(false)}
          title="知识提炼"
          subtitle="从内容中提炼结构化知识"
          icon="extract"
          steps={EXTRACTION_STEPS}
          status={extractionProgress.state.status}
          logs={extractionProgress.state.logs}
          error={extractionProgress.state.error}
          overallStatus={extractionProgress.state.overallStatus}
        />

        {showResult && job && (
          <ExtractionPanel job={job} onClose={() => setShowResult(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleExtract}
        className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition ${
          extractionProgress.isPolling
            ? 'bg-purple-50 text-purple-600 hover:bg-purple-100'
            : job
            ? 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
        }`}
        title={extractionProgress.isPolling ? '点击查看提炼进度' : '从内容中提炼结构化知识'}
      >
        <Sparkles size={12} />
        {extractionProgress.isPolling
          ? '提炼中...'
          : job
          ? '✓ 提炼完成'
          : '提炼知识'}
      </button>

      <TaskProgressDrawer
        isOpen={showProgress}
        onClose={() => setShowProgress(false)}
        title="知识提炼"
        subtitle="从内容中提炼结构化知识"
        icon="extract"
        steps={EXTRACTION_STEPS}
        status={extractionProgress.state.status}
        logs={extractionProgress.state.logs}
        error={extractionProgress.state.error}
        overallStatus={extractionProgress.state.overallStatus}
      />

      {showResult && job && (
        <ExtractionPanel job={job} onClose={() => setShowResult(false)} />
      )}
    </>
  );
}
