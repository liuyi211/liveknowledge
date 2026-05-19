'use client';

import { useRef, useState } from 'react';
import { FileText, Link, Loader2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import ExtractionButton from './ExtractionButton';

type SourceMode = 'paste' | 'file' | 'url';

interface PreparedSource {
  sourceType: 'document' | 'import';
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export default function DocumentExtractionDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SourceMode>('paste');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [prepared, setPrepared] = useState<PreparedSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPrepared(null);
    setError(null);
  };

  const preparePaste = () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError('请先输入要提炼的内容');
      return;
    }
    setPrepared({
      sourceType: 'import',
      title: title.trim() || '粘贴导入',
      content: trimmed,
      metadata: { mode: 'paste' },
    });
    setError(null);
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.upload.uploadFile(file);
      if (!result.extractedText) {
        setError('此文件没有可提炼的文本内容');
        return;
      }
      setPrepared({
        sourceType: 'document',
        title: result.fileName || file.name,
        content: result.extractedText,
        metadata: {
          fileName: result.fileName || file.name,
          fileType: result.fileType || file.type,
          mode: 'file',
          extractedTextLength: result.extractedTextLength,
        },
      });
    } catch (err) {
      setError((err as Error).message || '文件解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUrl = async () => {
    const url = content.trim();
    if (!url) {
      setError('请输入 URL');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.upload.uploadUrl(url);
      setPrepared({
        sourceType: 'document',
        title: result.fileName || url,
        content: result.extractedText,
        metadata: {
          url,
          fileType: result.fileType,
          mode: 'url',
          extractedTextLength: result.extractedTextLength,
        },
      });
    } catch (err) {
      setError((err as Error).message || 'URL 解析失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100"
        title="从文档、URL 或粘贴文本创建提炼任务"
      >
        <Upload size={12} />
        文档提炼
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[680px] max-h-[85vh] bg-white rounded-lg flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">文档 / 导入提炼</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-4 space-y-4 overflow-auto">
              <div className="flex gap-2">
                {[
                  { key: 'paste' as const, label: '粘贴文本', icon: FileText },
                  { key: 'file' as const, label: '上传文件', icon: Upload },
                  { key: 'url' as const, label: 'URL', icon: Link },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setMode(item.key);
                        setContent('');
                        setTitle('');
                        reset();
                      }}
                      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${
                        mode === item.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Icon size={14} />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {mode === 'paste' && (
                <>
                  <input
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    placeholder="标题"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <textarea
                    value={content}
                    onChange={event => {
                      setContent(event.target.value);
                      reset();
                    }}
                    placeholder="粘贴要提炼的内容"
                    className="h-56 w-full rounded-md border px-3 py-2 text-sm leading-6"
                  />
                  <button type="button" onClick={preparePaste} className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white">
                    准备提炼
                  </button>
                </>
              )}

              {mode === 'file' && (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
                  >
                    选择文件
                  </button>
                  <p className="mt-2 text-xs text-gray-500">支持 PDF、Word、文本文件；图片仍建议在对话里交给视觉模型。</p>
                </div>
              )}

              {mode === 'url' && (
                <div className="flex gap-2">
                  <input
                    value={content}
                    onChange={event => {
                      setContent(event.target.value);
                      reset();
                    }}
                    placeholder="https://..."
                    className="flex-1 rounded-md border px-3 py-2 text-sm"
                  />
                  <button type="button" onClick={handleUrl} className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white">
                    抓取
                  </button>
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 size={14} className="animate-spin" />
                  解析中...
                </div>
              )}
              {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              {prepared && (
                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="font-medium text-sm">{prepared.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{prepared.content.length} 字符，来源：{prepared.sourceType === 'document' ? '文档' : '导入'}</div>
                </div>
              )}
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">关闭</button>
              {prepared && (
                <ExtractionButton
                  sourceType={prepared.sourceType}
                  title={prepared.title}
                  content={prepared.content}
                  metadata={prepared.metadata}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
