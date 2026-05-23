'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import MessageBubble from './MessageBubble';

export default function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const messagesLoading = useChatStore((s) => s.messagesLoading);
  const currentSession = useChatStore((s) => s.currentSession);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visibleMessages = messages.filter((m) => !m.isDeleted);

  const lastUserIndex = visibleMessages.map((m) => m.role).lastIndexOf('user');
  const lastAssistantIndex = visibleMessages.map((m) => m.role).lastIndexOf('assistant');

  useEffect(() => {
    if (messagesLoading) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [currentSession?.id, messagesLoading, visibleMessages.length]);

  useEffect(() => {
    if (!isStreaming) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [isStreaming, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {visibleMessages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <p className="text-lg font-medium">开始新对话</p>
          <p className="text-sm mt-1">输入问题或上传文件开始交流</p>
        </div>
      )}

      {visibleMessages.map((message, index) => (
        <MessageBubble
          key={message.id || index}
          message={message}
          isLastUserMessage={index === lastUserIndex}
          isLastAssistantMessage={index === lastAssistantIndex}
          isStreaming={isStreaming}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
