import { useEffect, useRef } from 'react';

interface Props {
  logs: string[];
}

export default function CombatLog({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to top (newest log) when a new entry arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="flex flex-col bg-[rgba(10,15,30,0.92)] border border-[#0f3460] rounded-md overflow-hidden">
      <p className="text-[#888] text-xs uppercase tracking-wider px-2 py-1 border-b border-[#0f3460]">
        Combat Log
      </p>
      <div className="flex flex-col-reverse overflow-y-auto max-h-[240px] sm:max-h-[300px] px-2 py-1 gap-0.5">
        <div ref={bottomRef} />
        {logs.map((entry, i) => (
          <p key={i} className="text-[#bbb] text-xs py-0.5 border-b border-[#1a1a2e] last:border-0">
            {entry}
          </p>
        ))}
      </div>
    </div>
  );
}
