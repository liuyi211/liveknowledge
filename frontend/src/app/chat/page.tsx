'use client';

import ChatLayout from '@/components/chat/ChatLayout';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';

export default function ChatPage() {
  return (
    <ChatLayout>
      <MessageList />
      <MessageInput />
    </ChatLayout>
  );
}
