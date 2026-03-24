import { memo } from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
}

const ProgressBar = memo(function ProgressBar({ current, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-[#a08060] mb-1 tracking-wide">
        <span>{current} / {total}단</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="w-full h-1.5 bg-[#cce6e1] border border-[#78b0a8] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#b5541e] rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
});

export default ProgressBar;
