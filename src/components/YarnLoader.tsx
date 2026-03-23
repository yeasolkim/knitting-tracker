export default function YarnLoader({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <style>{`
        @keyframes yarn-draw {
          0%   { stroke-dashoffset: 380; }
          45%  { stroke-dashoffset: 0; }
          55%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 380; }
        }
        @keyframes ball-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes yarn-fade {
          0%, 100% { opacity: 0.7; }
          50%      { opacity: 1; }
        }
      `}</style>

      <svg width="88" height="88" viewBox="0 0 88 88">
        {/* Shadow */}
        <ellipse cx="44" cy="80" rx="22" ry="5" fill="#c4a882" opacity="0.25" />

        {/* Ball body */}
        <circle cx="44" cy="42" r="26" fill="#fde8c0" />

        {/* Rotating yarn texture on ball */}
        <g style={{ transformOrigin: '44px 42px', animation: 'ball-spin 4s linear infinite' }}>
          <ellipse cx="44" cy="42" rx="26" ry="11" fill="none" stroke="#dda060" strokeWidth="2.5" opacity="0.5" />
          <ellipse cx="44" cy="42" rx="11" ry="26" fill="none" stroke="#dda060" strokeWidth="2.5" opacity="0.5" />
          <ellipse cx="44" cy="42" rx="26" ry="16" fill="none" stroke="#d09050" strokeWidth="1.5" opacity="0.3"
            transform="rotate(45 44 42)" />
        </g>

        {/* Ball outline */}
        <circle cx="44" cy="42" r="26" fill="none" stroke="#c48050" strokeWidth="2" />

        {/*
          Spiral path: starts at outer edge (70,42) and winds inward CW.
          Each arc is a ~90° segment with slightly decreasing radius.
          Total ~2.5 turns.
        */}
        <path
          d="
            M 70,42
            A 26,26 0 0,1 44,16
            A 23,23 0 0,1 21,42
            A 21,21 0 0,1 44,64
            A 19,19 0 0,1 64,42
            A 17,17 0 0,1 44,25
            A 14,14 0 0,1 30,42
            A 12,12 0 0,1 44,54
            A 10,10 0 0,1 54,42
            A  8, 8 0 0,1 44,34
          "
          fill="none"
          stroke="#b5541e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="380"
          style={{
            animation: 'yarn-draw 2.6s ease-in-out infinite',
          }}
        />
      </svg>

      {text && (
        <p
          className="text-xs text-[#a08060] tracking-widest uppercase font-medium"
          style={{ animation: 'yarn-fade 2.6s ease-in-out infinite' }}
        >
          {text}
        </p>
      )}
    </div>
  );
}
