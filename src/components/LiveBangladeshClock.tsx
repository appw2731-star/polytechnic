import React, { useEffect, useState } from 'react';
import { Clock, Globe } from 'lucide-react';
import { DhakaClockSnapshot, getDhakaClockSnapshot, toBnDigits } from '../utils/formatBn';

interface LiveBangladeshClockProps {
  compact?: boolean;
  onOpenTimer?: () => void;
}

export const LiveBangladeshClock: React.FC<LiveBangladeshClockProps> = ({
  compact = false,
  onOpenTimer,
}) => {
  const [clock, setClock] = useState<DhakaClockSnapshot>(() => getDhakaClockSnapshot());

  useEffect(() => {
    const update = () => setClock(getDhakaClockSnapshot(new Date()));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 ${
        compact ? 'p-4' : 'p-5 lg:p-6'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Globe className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <span>বাংলাদেশ সময় · Asia/Dhaka</span>
        </div>

        {onOpenTimer && (
          <button
            type="button"
            onClick={onOpenTimer}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>স্টাডি টাইমার</span>
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <time
            dateTime={clock.hhmm24}
            className="font-mono text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums"
          >
            {toBnDigits(clock.hours12)}:{toBnDigits(clock.minutes)}
            <span className="text-sky-600 dark:text-sky-400">:{toBnDigits(clock.seconds)}</span>
          </time>

          <div className="flex flex-col leading-tight">
            <span className="font-mono text-sm sm:text-base font-bold text-sky-600 dark:text-sky-400">
              {clock.ampm}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {clock.periodBn}
            </span>
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {clock.weekdayBn}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{clock.dateBn}</p>
        </div>
      </div>
    </div>
  );
};
