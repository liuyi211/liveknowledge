'use client';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

function StreamingCodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-3 py-1.5">
        <span className="font-mono text-xs text-gray-500">{language || 'text'}</span>
      </div>
      <pre className="m-0 overflow-x-auto bg-gray-50 px-4 py-3 text-[13px] leading-6">
        <code className="font-mono text-gray-800">{code}</code>
      </pre>
    </div>
  );
}

export default function StreamingText({ content, isStreaming }: StreamingTextProps) {
  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            if (match) {
              return <StreamingCodeBlock language={match[1]} code={codeString} />;
            }
            return (
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-sm text-red-600" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="animate-pulse">|</span>}
    </>
  );
}
