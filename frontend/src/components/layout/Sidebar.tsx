'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  GitBranch,
  Brain,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { href: '/chat', label: '对话', icon: MessageSquare },
  { href: '/notes', label: '知识库', icon: BookOpen },
  { href: '/graph', label: '知识图谱', icon: GitBranch },
  { href: '/review', label: '复习', icon: Brain },
  { href: '/settings', label: '设置', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-16 bg-gray-900 text-white flex flex-col items-center py-4 shrink-0">
      <div className="mb-6 text-blue-400 font-bold text-lg">LK</div>

      <nav className="flex-1 flex flex-col space-y-2 w-full px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-2 px-1 rounded-md transition-colors text-xs ${
                isActive
                  ? 'bg-gray-700 text-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
              title={item.label}
            >
              <Icon size={20} />
              <span className="mt-1 scale-90">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
