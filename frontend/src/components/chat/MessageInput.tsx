'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { api } from '@/lib/api';
import { Send, Square, Paperclip, X, FileText, Image, FileSpreadsheet, Loader2 } from 'lucide-react';

function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return <Image size={14} />;
  if (fileType.includes('word') || fileType.includes('document')) return <FileSpreadsheet size={14} />;
  return <FileText size={14} />;
}

export default function MessageInput() {
  const [input, setInput] = useState('');
  const [uploadingCount, setUploadingCount] = useState(0);
  const currentSession = useChatStore((s) => s.currentSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const abortStream = useChatStore((s) => s.abortStream);
  const sessionAttachments = useChatStore((s) => s.sessionAttachments);
  const addSessionAttachment = useChatStore((s) => s.addSessionAttachment);
  const removeSessionAttachment = useChatStore((s) => s.removeSessionAttachment);
  const clearSessionAttachments = useChatStore((s) => s.clearSessionAttachments);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadingCount > 0;

  const handleSend = useCallback(async () => {
    if ((!input.trim() && sessionAttachments.length === 0) || !currentSession || isStreaming) return;

    const content = input.trim() || (sessionAttachments.length > 0 ? '请分析上传的文件' : '');
    setInput('');

    const attachments = sessionAttachments.map((a) => ({
      fileName: a.fileName,
      fileType: a.fileType,
      extractedText: a.extractedText,
      base64: a.base64,
    }));

    await sendMessage(content, attachments);
  }, [input, sessionAttachments, currentSession, isStreaming, sendMessage]);

  const handleStop = useCallback(() => {
    abortStream?.();
  }, [abortStream]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploadSingleFile = async (file: File) => {
    setUploadingCount((c) => c + 1);
    try {
      const result = await api.upload.uploadFile(file);
      addSessionAttachment({
        fileName: result.fileName,
        fileType: result.fileType,
        extractedText: result.extractedText,
        base64: result.base64,
      });
    } catch (err) {
      alert(`上传失败 "${file.name}": ${(err as Error).message}`);
    } finally {
      setUploadingCount((c) => Math.max(0, c - 1));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await Promise.all(Array.from(files).map(uploadSingleFile));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageItems.push(file);
      }
    }

    if (imageItems.length > 0) {
      e.preventDefault();
      await Promise.all(imageItems.map(uploadSingleFile));
    }
  }, []);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {/* Session attachments + uploading indicator */}
      {(sessionAttachments.length > 0 || isUploading) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {sessionAttachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center space-x-1.5 bg-gray-100 px-2 py-1 rounded-lg text-xs text-gray-600"
            >
              {getFileIcon(att.fileType)}
              <span className="max-w-[120px] truncate">{att.fileName}</span>
              <button
                onClick={() => removeSessionAttachment(i)}
                className="text-gray-400 hover:text-red-500"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="flex items-center space-x-1.5 bg-blue-50 px-2 py-1 rounded-lg text-xs text-blue-600">
              <Loader2 size={14} className="animate-spin" />
              <span>上传中 ({uploadingCount})...</span>
            </div>
          )}
          {sessionAttachments.length > 0 && (
            <button
              onClick={clearSessionAttachments}
              className="text-xs text-gray-400 hover:text-red-500 px-1"
            >
              清空全部
            </button>
          )}
        </div>
      )}

      <div className="flex items-end space-x-2">
        {/* Attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isStreaming}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.py,.html,.css,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            adjustTextareaHeight();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="输入消息... (Shift+Enter 换行，粘贴图片直接上传)"
          rows={1}
          disabled={isStreaming}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm leading-relaxed min-h-[40px] max-h-[200px] disabled:bg-gray-50"
        />

        {/* Send/Stop button */}
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
          >
            <Square size={18} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={(!input.trim() && sessionAttachments.length === 0) || isUploading}
            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
