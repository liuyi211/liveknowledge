'use client';

import { useState } from 'react';
import { Send, Square } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';

export default function MessageInput() {
  const [input, setInput] = useState('');
  const currentSession = useAppStore((s) => s.currentSession);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastMessage = useAppStore((s) => s.updateLastMessage);
  const setIsStreaming = useAppStore((s) => s.setIsStreaming);
  const isStreaming = useAppStore((s) => s.isStreaming);

  const handleSend = async () => {
    if (!input.trim() || !currentSession || isStreaming) return;

    const content = input.trim();
    setInput('');

    // Add user message immediately
    addMessage({
      id: `temp-${Date.now()}`,
      sessionId: currentSession.id,
      role: 'user',
      content,
      modelId: null,
      createdAt: new Date().toISOString(),
    });

    setIsStreaming(true);

    // Add placeholder assistant message
    addMessage({
      id: `temp-${Date.now()}-assistant`,
      sessionId: currentSession.id,
      role: 'assistant',
      content: '',
      modelId: null,
      createdAt: new Date().toISOString(),
    });

    try {
      const response = await api.messages.sendStream(currentSession.id, content);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (!value) continue;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'chunk') {
            updateLastMessage(data.content);
          } else if (data.type === 'done') {
            done = true;
          } else if (data.type === 'error') {
            updateLastMessage(`\n\nError: ${data.error}`);
            done = true;
          }
        }
      }
    } catch (err) {
      updateLastMessage(`\n\nError: ${(err as Error).message}`);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t p-4 bg-white">
      <div className="flex items-center space-x-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 px-4 py-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isStreaming ? <Square size={20} /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );
}
