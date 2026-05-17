'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

interface MarkdownPreviewProps {
  content: string;
  empty?: string;
}

export default function MarkdownPreview({ content, empty = '此笔记还没有内容' }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return <div className="text-gray-400 italic">{empty}</div>;
  }

  return (
    <article className="prose prose-slate max-w-none prose-headings:font-bold prose-pre:my-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (match) {
              return (
                <SyntaxHighlighter
                  PreTag="div"
                  language={match[1]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  style={oneDark as any}
                  customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.875rem' }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            return <code className={className} {...props}>{children}</code>;
          },
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
