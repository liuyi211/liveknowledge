'use client';

import { useAppStore } from '@/stores/app-store';
import StreamingText from './StreamingText';

export default function MessageList() {
  const messages = useAppStore((s) => s.messages);
  const isStreaming = useAppStore((s) => s.isStreaming);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => (
        <div
          key={message.id || index}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-3xl px-4 py-2 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}
          >
            {message.role === 'assistant' ? (
              <StreamingText
                content={message.content}
                isStreaming={index === messages.length - 1 && isStreaming}
              />
            ) : (
              <p>{message.content}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
