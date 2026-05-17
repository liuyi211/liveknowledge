'use client';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

// StreamingText is now handled inline in MessageBubble via ReactMarkdown
// This component is kept for backward compatibility but simplified
export default function StreamingText({ content, isStreaming }: StreamingTextProps) {
  return (
    <div className="prose prose-sm max-w-none">
      <p className="whitespace-pre-wrap">{content}</p>
      {isStreaming && <span className="animate-pulse">▌</span>}
    </div>
  );
}
