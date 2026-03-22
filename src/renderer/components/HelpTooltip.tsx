import { useRef, useState } from 'react';

export function HelpTooltip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      className="cursor-help inline-flex"
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ top: r.top, left: r.left + r.width / 2 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      <span className="text-xs text-gray-500 select-none">ⓘ</span>
      {pos && (
        <span
          style={{
            position: 'fixed',
            top: pos.top - 8,
            left: pos.left,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
          className="w-64 rounded bg-gray-800 border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 shadow-lg pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}
