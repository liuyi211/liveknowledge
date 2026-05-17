'use client';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

export default function StreamingText({ content, isStreaming }: StreamingTextProps) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="animate-pulse">▌</span>}
    </div>
  );
}
