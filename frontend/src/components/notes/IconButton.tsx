'use client';

import { ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

interface IconButtonProps {
  tooltip: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}

export default function IconButton({ tooltip, onClick, active, children }: IconButtonProps) {
  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            className={`p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition ${
              active ? 'bg-gray-100 text-gray-900' : ''
            }`}
          >
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={5}
            className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
          >
            {tooltip}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
