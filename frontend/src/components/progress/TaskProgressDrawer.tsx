'use client';

import { useEffect, useRef } from 'react';
import { X, FileText, Sparkles, Database, Activity } from 'lucide-react';
import StepTimeline from './StepTimeline';
import type { ProgressStep, ProgressLog, TaskOverallStatus } from './types';

interface TaskProgressDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: 'index' | 'extract' | 'generic';
  steps: ProgressStep[];
  status: string;
  logs: ProgressLog[];
  error?: string | null;
  overallStatus: TaskOverallStatus;
  startedAt?: string;
  completedAt?: string;
}

function TaskIcon({ type }: { type: 'index' | 'extract' | 'generic' }) {
  if (type === 'index') {
    return (
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
        <Database size={18} className="text-blue-600" />
      </div>
    );
  }
  if (type === 'extract') {
    return (
      <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
        <Sparkles size={18} className="text-purple-600" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
      <Activity size={18} className="text-gray-600" />
    </div>
  );
}

function StatusBadge({ status }: { status: TaskOverallStatus }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        已完成
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        失败
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        处理中
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
      等待中
    </span>
  );
}

function formatElapsed(start?: string, end?: string): string {
  if (!start) return '';
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = endTime - startTime;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export default function TaskProgressDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  icon = 'generic',
  steps,
  status,
  logs,
  error,
  overallStatus,
  startedAt,
  completedAt,
}: TaskProgressDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <TaskIcon type={icon} />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
                {subtitle && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Meta info row */}
          <div className="flex items-center gap-3 mt-3">
            <StatusBadge status={overallStatus} />
            {(startedAt && overallStatus === 'running') && (
              <span className="text-xs text-gray-400">
                已运行 {formatElapsed(startedAt)}
              </span>
            )}
            {(startedAt && completedAt && overallStatus === 'completed') && (
              <span className="text-xs text-gray-400">
                耗时 {formatElapsed(startedAt, completedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <StepTimeline
            steps={steps}
            currentStatus={status}
            logs={logs}
            overallStatus={overallStatus}
            error={error}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {logs.length > 0
                ? `共 ${logs.length} 条日志记录`
                : '等待任务开始...'}
            </span>
            {overallStatus === 'completed' && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                完成
              </button>
            )}
            {overallStatus === 'failed' && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
