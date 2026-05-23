'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Copy, RotateCcw, ThumbsUp, ThumbsDown, Pencil, Trash2, Check, X, FileText, Image, FileSpreadsheet } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';
import type { Message } from '@/types';
import ThinkingBlock from './ThinkingBlock';
import CodeBlock from './CodeBlock';
import StreamingText from './StreamingText';

interface MessageBubbleProps {
  message: Message;
  isLastUserMessage: boolean;
  isLastAssistantMessage: boolean;
  isStreaming: boolean;
}

function getAttachmentLabel(fileType: string): string {
  if (fileType.startsWith('image/')) return '图片';
  if (fileType.includes('pdf')) return 'PDF';
  if (fileType.includes('word') || fileType.includes('document')) return '文档';
  return '文件';
}

function AttachmentCard({ attachment }: { attachment: { fileName: string; fileType: string; extractedText?: string | null; base64?: string | null } }) {
  const label = getAttachmentLabel(attachment.fileType);
  const mode = attachment.base64 || attachment.fileType.startsWith('image/') ? 'vision' : 'text';
  const status = mode === 'vision'
    ? '图片已发送给支持视觉的模型'
    : attachment.extractedText
    ? `文本已注入上下文，约 ${attachment.extractedText.length} 字符`
    : '附件已记录';

  return (
    <div className="flex items-center space-x-2 mb-2 px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 max-w-[260px]" title={status}>
      <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center shrink-0">
        {attachment.fileType.startsWith('image/') ? (
          <Image size={12} className="text-blue-500" />
        ) : attachment.fileType.includes('pdf') ? (
          <FileText size={12} className="text-red-500" />
        ) : attachment.fileType.includes('word') || attachment.fileType.includes('document') ? (
          <FileSpreadsheet size={12} className="text-blue-500" />
        ) : (
          <FileText size={12} className="text-gray-500" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-700 truncate" title={attachment.fileName}>{attachment.fileName}</p>
        <p className="text-[10px] text-gray-400">{label} · {mode}</p>
      </div>
    </div>
  );
}

function MessageActions({ message, isLastUserMessage, isLastAssistantMessage, isStreaming }: MessageBubbleProps) {
  const feedbackMessage = useChatStore((s) => s.feedbackMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const regenerateMessage = useChatStore((s) => s.regenerateMessage);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center space-x-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {message.role === 'assistant' && (
        <>
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="复制"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
          </button>
          {isLastAssistantMessage && !isStreaming && (
            <button
              onClick={() => regenerateMessage(message.id)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="重新生成"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            onClick={() => feedbackMessage(message.id, 'like')}
            className={`p-1 rounded ${message.feedback === 'like' ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
            title="有用"
          >
            <ThumbsUp size={14} />
          </button>
          <button
            onClick={() => feedbackMessage(message.id, 'dislike')}
            className={`p-1 rounded ${message.feedback === 'dislike' ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
            title="无用"
          >
            <ThumbsDown size={14} />
          </button>
        </>
      )}
      {message.role === 'user' && (
        <button
          onClick={() => deleteMessage(message.id)}
          className="p-1 text-gray-400 hover:text-red-600 rounded"
          title="删除"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export default function MessageBubble({ message, isLastUserMessage, isLastAssistantMessage, isStreaming }: MessageBubbleProps) {
  const editAndResend = useChatStore((s) => s.editAndResend);
  const isStreamingLast = isLastAssistantMessage && isStreaming;
  const liveStreamingContent = useChatStore((s) => (isStreamingLast ? s.streamingContent : ''));
  const liveThinkingContent = useChatStore((s) => (isStreamingLast ? s.thinkingContent : ''));
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

  const handleEditSave = () => {
    if (editValue.trim() && editValue.trim() !== message.content) {
      editAndResend(message.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const isUser = message.role === 'user';
  const displayContent = isStreamingLast ? liveStreamingContent || message.content : message.content;
  const displayThinkingContent = isStreamingLast ? liveThinkingContent || message.thinkingContent : message.thinkingContent;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-3xl ${isUser ? 'w-auto' : 'w-full'}`}>
        {/* Attachments - outside bubble */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-2 mb-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {message.attachments.map((att, i) => (
              <AttachmentCard key={i} attachment={att} />
            ))}
          </div>
        )}

        {/* Thinking block for assistant */}
        {!isUser && displayThinkingContent && (
          <ThinkingBlock
            content={displayThinkingContent}
            isStreaming={isStreamingLast && !displayContent}
          />
        )}

        {/* Message content */}
        {isEditing ? (
          <div className="flex flex-col space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
              autoFocus
            />
            <div className="flex items-center space-x-2 justify-end">
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
              >
                <X size={12} />
                <span>取消</span>
              </button>
              <button
                onClick={handleEditSave}
                className="flex items-center space-x-1 px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded"
              >
                <Check size={12} />
                <span>保存并重新生成</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`px-4 py-2.5 rounded-2xl ${
              isUser
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm'
            }`}
          >
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
            ) : (
              <div className="prose prose-sm max-w-none">
                {isStreamingLast && !displayContent ? (
                  <div className="flex items-center space-x-1 text-gray-400">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : isStreamingLast ? (
                  <StreamingText content={displayContent} isStreaming />
                ) : (
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
                          return <CodeBlock language={match[1]} code={codeString} />;
                        }
                        return (
                          <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-red-600" {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {displayContent}
                  </ReactMarkdown>
                )}
              </div>
            )}
          </div>
        )}

        {/* Edit button for last user message */}
        {isUser && isLastUserMessage && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="mt-1 ml-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
          >
            <Pencil size={12} />
          </button>
        )}

        {/* Actions */}
        {!isEditing && (
          <MessageActions
            message={message}
            isLastUserMessage={isLastUserMessage}
            isLastAssistantMessage={isLastAssistantMessage}
            isStreaming={isStreaming}
          />
        )}
      </div>
    </div>
  );
}
