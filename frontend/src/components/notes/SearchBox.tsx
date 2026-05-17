'use client';

import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

interface Props {
  autoFocus?: boolean;
}

export default function SearchBox({ autoFocus }: Props) {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={ref}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="搜索笔记"
        className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-100 rounded-md outline-none focus:bg-white focus:ring-2 focus:ring-blue-200 transition"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
