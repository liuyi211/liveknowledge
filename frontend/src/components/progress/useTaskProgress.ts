'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskProgressState, TaskOverallStatus } from './types';

interface UseTaskProgressOptions {
  pollInterval?: number;
  onComplete?: () => void;
  onFailed?: () => void;
}

function deriveOverallStatus(status: string): TaskOverallStatus {
  if (status === 'done' || status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (['chunking', 'embedding', 'storing', 'preprocessing', 'extracting', 'generating', 'pending'].includes(status)) return 'running';
  return 'idle';
}

export function useTaskProgress<T extends { status: string; logs?: any[]; error?: string | null }>(
  fetchStatus: () => Promise<T>,
  isTerminal: (status: string) => boolean,
  options: UseTaskProgressOptions = {}
) {
  const { pollInterval = 1500 } = options;
  const [state, setState] = useState<TaskProgressState>({
    status: 'idle',
    logs: [],
    error: null,
    overallStatus: 'idle',
  });
  const [isPolling, setIsPolling] = useState(false);

  // Use refs to avoid stale closures in interval callbacks
  const fetchRef = useRef(fetchStatus);
  const isTerminalRef = useRef(isTerminal);
  const optionsRef = useRef(options);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTriggeredComplete = useRef(false);
  const hasTriggeredFailed = useRef(false);

  // Keep refs up to date
  useEffect(() => {
    fetchRef.current = fetchStatus;
    isTerminalRef.current = isTerminal;
    optionsRef.current = options;
  });

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await fetchRef.current();
      const overallStatus = deriveOverallStatus(data.status);

      setState({
        status: data.status,
        logs: data.logs || [],
        error: data.error || null,
        overallStatus,
      });

      if (isTerminalRef.current(data.status)) {
        clearPolling();
        if (overallStatus === 'completed' && !hasTriggeredComplete.current) {
          hasTriggeredComplete.current = true;
          optionsRef.current.onComplete?.();
        }
        if (overallStatus === 'failed' && !hasTriggeredFailed.current) {
          hasTriggeredFailed.current = true;
          optionsRef.current.onFailed?.();
        }
      }
    } catch (err) {
      console.error('[TaskProgress] poll failed:', err);
      // Stop polling on persistent error to avoid spinning
      clearPolling();
      setState((prev) => ({
        ...prev,
        overallStatus: 'failed' as TaskOverallStatus,
        error: prev.error || '轮询失败，请刷新页面重试',
      }));
    }
  }, [clearPolling]);

  const startPolling = useCallback(() => {
    hasTriggeredComplete.current = false;
    hasTriggeredFailed.current = false;
    setState({
      status: 'pending',
      logs: [],
      error: null,
      overallStatus: 'running',
    });
    setIsPolling(true);

    // Immediate first poll
    poll();

    intervalRef.current = setInterval(poll, pollInterval);
  }, [poll, pollInterval]);

  const stopPolling = useCallback(() => {
    clearPolling();
  }, [clearPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    state,
    isPolling,
    startPolling,
    stopPolling,
    refresh: poll,
  };
}
