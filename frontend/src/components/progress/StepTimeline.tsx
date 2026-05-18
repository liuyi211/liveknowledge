'use client';

import { useState } from 'react';
import { Check, Loader2, AlertCircle, Circle, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import type { ProgressStep, ProgressLog, TaskOverallStatus } from './types';

interface StepTimelineProps {
  steps: ProgressStep[];
  currentStatus: string;
  logs: ProgressLog[];
  overallStatus: TaskOverallStatus;
  error?: string | null;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getStepStatus(
  step: ProgressStep,
  currentStatus: string,
  logs: ProgressLog[],
  overallStatus: TaskOverallStatus
): { state: 'pending' | 'running' | 'completed' | 'failed'; duration?: number; startedAt?: string } {
  // Check logs for completed/failed
  const completedLog = logs.find((l) => l.step === step.key && l.status === 'completed');
  if (completedLog) {
    return { state: 'completed', duration: completedLog.duration_ms, startedAt: completedLog.timestamp };
  }

  const failedLog = logs.find((l) => l.step === step.key && l.status === 'failed');
  if (failedLog || (overallStatus === 'failed' && isStepCurrent(step, currentStatus))) {
    return { state: 'failed', duration: failedLog?.duration_ms, startedAt: failedLog?.timestamp };
  }

  // Check if currently running
  if (isStepCurrent(step, currentStatus)) {
    const startedLog = logs.find((l) => l.step === step.key && l.status === 'started');
    return { state: 'running', startedAt: startedLog?.timestamp };
  }

  return { state: 'pending' };
}

function isStepCurrent(step: ProgressStep, currentStatus: string): boolean {
  const statusMap: Record<string, string> = {
    chunking: 'chunk',
    embedding: 'embed',
    storing: 'store',
    preprocessing: 'preprocess',
    extracting: 'extract',
    generating: 'generate',
  };
  return statusMap[currentStatus] === step.key;
}

function StepIcon({ state }: { state: 'pending' | 'running' | 'completed' | 'failed' }) {
  if (state === 'completed') {
    return (
      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center border-2 border-green-200">
        <Check size={14} className="text-green-600" />
      </div>
    );
  }
  if (state === 'running') {
    return (
      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center border-2 border-blue-300">
        <Loader2 size={14} className="text-blue-600 animate-spin" />
      </div>
    );
  }
  if (state === 'failed') {
    return (
      <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center border-2 border-red-200">
        <AlertCircle size={14} className="text-red-600" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center border-2 border-gray-200">
      <Circle size={12} className="text-gray-300" />
    </div>
  );
}

function LogDetail({ log }: { log: ProgressLog }) {
  const [expanded, setExpanded] = useState(false);

  if (!log.detail || Object.keys(log.detail).length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{expanded ? '收起详情' : '查看详情'}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 pl-4 py-2 bg-gray-50 rounded-md text-xs text-gray-600 font-mono leading-relaxed">
          {Object.entries(log.detail).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-gray-400 shrink-0">{key}:</span>
              <span className="break-all">{typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value as string | number | boolean | null | undefined)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StepTimeline({ steps, currentStatus, logs, overallStatus, error }: StepTimelineProps) {
  const completedCount = steps.filter((s) =>
    logs.some((l) => l.step === s.key && l.status === 'completed')
  ).length;

  const progressPercent = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div className="space-y-0">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            {overallStatus === 'completed'
              ? '全部完成'
              : overallStatus === 'failed'
              ? '处理失败'
              : overallStatus === 'running'
              ? `进行中 ${completedCount}/${steps.length}`
              : '等待开始'}
          </span>
          <span className="text-xs text-gray-400">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              overallStatus === 'failed'
                ? 'bg-red-400'
                : overallStatus === 'completed'
                ? 'bg-green-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="relative">
        {steps.map((step, index) => {
          const { state, duration, startedAt } = getStepStatus(step, currentStatus, logs, overallStatus);
          const isLast = index === steps.length - 1;
          const stepLog = logs.find((l) => l.step === step.key);

          return (
            <div key={step.key} className="relative">
              {/* Connector line */}
              {!isLast && (
                <div
                  className="absolute left-[13px] top-7 w-0.5 h-[calc(100%-14px)] -z-0"
                  style={{ background: state === 'completed' ? '#dcfce7' : '#f3f4f6' }}
                />
              )}

              <div className="flex gap-3 pb-5 relative z-10">
                {/* Icon */}
                <div className="shrink-0 pt-0.5">
                  <StepIcon state={state} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium ${
                        state === 'completed'
                          ? 'text-green-700'
                          : state === 'running'
                          ? 'text-blue-700'
                          : state === 'failed'
                          ? 'text-red-700'
                          : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {duration !== undefined && duration > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-gray-400">
                          <Clock size={10} />
                          {formatDuration(duration)}
                        </span>
                      )}
                      {startedAt && state === 'running' && (
                        <span className="text-xs text-blue-400">{formatTime(startedAt)}</span>
                      )}
                    </div>
                  </div>

                  <p
                    className={`text-xs mt-0.5 leading-relaxed ${
                      state === 'pending' ? 'text-gray-300' : 'text-gray-500'
                    }`}
                  >
                    {step.description}
                  </p>

                  {stepLog && <LogDetail log={stepLog} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error && overallStatus === 'failed' && (
        <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-700">处理失败</p>
              <p className="text-xs text-red-600 mt-0.5 break-words">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
