'use client';

import { X } from 'lucide-react';

interface TagStat {
  tag: string;
  count: number;
}

interface TagFilterProps {
  tags: TagStat[];
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
}

export default function TagFilter({ tags, selectedTag, onSelect }: TagFilterProps) {
  if (tags.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-gray-400">
        暂无标签
      </div>
    );
  }

  return (
    <div className="px-2 py-2 border-b bg-white">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">标签</span>
        {selectedTag && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-400"
            title="清除标签筛选"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((item) => (
          <button
            key={item.tag}
            type="button"
            onClick={() => onSelect(selectedTag === item.tag ? null : item.tag)}
            className={`max-w-full rounded px-2 py-1 text-xs transition ${
              selectedTag === item.tag
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={`${item.tag} (${item.count})`}
          >
            <span className="inline-block max-w-32 truncate align-bottom">{item.tag}</span>
            <span className="ml-1 opacity-75">{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
