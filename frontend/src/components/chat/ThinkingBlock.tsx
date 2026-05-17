'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export default function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content && !isStreaming) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center space-x-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={12} />
        <span>
          {isStreaming ? '思考中...' : '已思考'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 pl-4 border-l-2 border-gray-200 text-sm text-gray-500 whitespace-pre-wrap leading-relaxed">
          {content}
          {isStreaming && <span className="animate-pulse">▌</span>}
        </div>
      )}
    </div>
  );
}
