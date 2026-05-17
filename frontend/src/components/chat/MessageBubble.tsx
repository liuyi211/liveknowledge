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

function AttachmentIcons({ attachments }: { attachments?: Array<{ fileName: string; fileType: string }> }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {attachments.map((att, i) => (
        <span
          key={i}
          className="inline-flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
          title={att.fileName}
        >
          {att.fileType.startsWith('image/') ? <Image size={10} /> : att.fileType.includes('word') || att.fileType.includes('document') ? <FileSpreadsheet size={10} /> : <FileText size={10} />}
          <span className="max-w-[80px] truncate">{att.fileName}</span>
        </span>
      ))}
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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

  const handleEditSave = () => {
    if (editValue.trim() && editValue.trim() !== message.content) {
      editAndResend(message.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-3xl ${isUser ? 'w-auto' : 'w-full'}`}>
        {/* Thinking block for assistant */}
        {!isUser && message.thinkingContent && (
          <ThinkingBlock
            content={message.thinkingContent}
            isStreaming={isStreamingLast && !message.content}
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
            {message.attachments && message.attachments.length > 0 && (
              <AttachmentIcons attachments={message.attachments} />
            )}
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
            ) : (
              <div className="prose prose-sm max-w-none">
                {isStreamingLast && !message.content ? (
                  <div className="flex items-center space-x-1 text-gray-400">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
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
                    {message.content}
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
