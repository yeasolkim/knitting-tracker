export default function MonkeyKnitting({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 240"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      <defs>
        <pattern id="mkBg" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#F5EDDA" />
          <line x1="0" y1="20" x2="20" y2="20" stroke="#E0D4BB" strokeWidth="0.5" />
          <line x1="20" y1="0" x2="20" y2="20" stroke="#E0D4BB" strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* Background tiles */}
      <rect width="200" height="240" fill="url(#mkBg)" />

      {/* Steam wisps — left */}
      <rect x="62" y="10" width="4" height="14" fill="#DCE8F5" rx="2" opacity="0.7" />
      <rect x="66" y="6"  width="4" height="18" fill="#DCE8F5" rx="2" opacity="0.8" />
      <rect x="70" y="10" width="4" height="12" fill="#DCE8F5" rx="2" opacity="0.6" />
      {/* Steam wisps — center */}
      <rect x="96"  y="4"  width="4" height="18" fill="#DCE8F5" rx="2" opacity="0.8" />
      <rect x="100" y="0"  width="4" height="20" fill="#DCE8F5" rx="2" opacity="0.85" />
      <rect x="104" y="4"  width="4" height="16" fill="#DCE8F5" rx="2" opacity="0.75" />
      {/* Steam wisps — right */}
      <rect x="130" y="10" width="4" height="14" fill="#DCE8F5" rx="2" opacity="0.6" />
      <rect x="134" y="6"  width="4" height="18" fill="#DCE8F5" rx="2" opacity="0.7" />
      <rect x="138" y="10" width="4" height="12" fill="#DCE8F5" rx="2" opacity="0.55" />

      {/* ── TOWEL ── */}
      {/* Puffy white part */}
      <rect x="72" y="28" width="56" height="28" fill="#FFFFFF" rx="14" />
      <rect x="68" y="36" width="64" height="20" fill="#FFFFFF" rx="8" />
      {/* Roll band */}
      <rect x="66" y="50" width="68" height="10" fill="#F5EBB8" rx="4" />
      <rect x="70" y="51" width="60" height="8"  fill="#EEDEA0" rx="3" />
      {/* Roll band shadow top */}
      <rect x="68" y="50" width="64" height="2" fill="#D8CC88" rx="1" opacity="0.5" />

      {/* ── EARS (behind head) ── */}
      <rect x="56" y="78" width="18" height="24" fill="#7A4820" rx="7" />
      <rect x="60" y="82" width="11" height="17" fill="#C07848" rx="4" />
      <rect x="126" y="78" width="18" height="24" fill="#7A4820" rx="7" />
      <rect x="129" y="82" width="11" height="17" fill="#C07848" rx="4" />

      {/* ── HEAD ── */}
      <rect x="66" y="56" width="68" height="78" fill="#7A4820" rx="12" />
      {/* Face */}
      <rect x="74" y="64" width="52" height="64" fill="#9B5C30" rx="8" />
      {/* Face center */}
      <rect x="80" y="76" width="40" height="46" fill="#D08848" rx="8" />
      <rect x="84" y="80" width="32" height="38" fill="#DC9A5A" rx="6" />

      {/* Eyebrows */}
      <rect x="80" y="80" width="14" height="4" fill="#3D1A08" rx="2" />
      <rect x="106" y="80" width="14" height="4" fill="#3D1A08" rx="2" />

      {/* Eyes */}
      <rect x="82" y="87" width="12" height="10" fill="#1A0A04" rx="3" />
      <rect x="106" y="87" width="12" height="10" fill="#1A0A04" rx="3" />
      {/* Eye shine */}
      <rect x="87" y="88" width="5" height="5" fill="#FFFFFF" rx="1" />
      <rect x="111" y="88" width="5" height="5" fill="#FFFFFF" rx="1" />

      {/* Blush */}
      <rect x="74"  y="98" width="16" height="9" fill="#F07070" rx="4" opacity="0.45" />
      <rect x="110" y="98" width="16" height="9" fill="#F07070" rx="4" opacity="0.45" />

      {/* Nose */}
      <rect x="94" y="100" width="12" height="9" fill="#6B3C18" rx="4" />
      <rect x="95" y="102" width="4"  height="5" fill="#2A0A04" rx="2" />
      <rect x="101" y="102" width="4" height="5" fill="#2A0A04" rx="2" />

      {/* Mouth / smile */}
      <rect x="88" y="113" width="24" height="5" fill="#3D1A08" rx="2" />
      <rect x="90" y="115" width="20" height="4" fill="#C04848" rx="2" />
      {/* Smile corners */}
      <rect x="86" y="111" width="5" height="5" fill="#3D1A08" rx="2" />
      <rect x="109" y="111" width="5" height="5" fill="#3D1A08" rx="2" />

      {/* ── NECK ── */}
      <rect x="90" y="134" width="20" height="14" fill="#7A4820" />

      {/* ── BODY ── */}
      <rect x="66" y="144" width="68" height="54" fill="#7A4820" rx="4" />
      <rect x="70" y="148" width="60" height="46" fill="#9B5C30" rx="2" />
      {/* Belly */}
      <rect x="84" y="150" width="32" height="38" fill="#C07848" rx="10" />

      {/* ── LEFT ARM ── */}
      <rect x="34" y="148" width="36" height="14" fill="#7A4820" rx="6" />
      <rect x="30" y="150" width="28" height="12" fill="#9B5C30" rx="4" />
      {/* Left hand */}
      <rect x="26" y="152" width="14" height="13" fill="#C07848" rx="3" />

      {/* ── RIGHT ARM ── */}
      <rect x="130" y="148" width="36" height="14" fill="#7A4820" rx="6" />
      <rect x="142" y="150" width="28" height="12" fill="#9B5C30" rx="4" />
      {/* Right hand */}
      <rect x="160" y="152" width="14" height="13" fill="#C07848" rx="3" />

      {/* ── KNITTING NEEDLES ── */}
      {/* Left needle: from left hand up-right */}
      <line x1="33"  y1="162" x2="90"  y2="138" stroke="#B8D4E8" strokeWidth="4" strokeLinecap="round" />
      <circle cx="31" cy="163" r="4" fill="#EAF2F8" />
      {/* Right needle: from right hand up-left */}
      <line x1="167" y1="162" x2="110" y2="138" stroke="#B8D4E8" strokeWidth="4" strokeLinecap="round" />
      <circle cx="169" cy="163" r="4" fill="#EAF2F8" />

      {/* ── KNITTING WORK (swatch between needles) ── */}
      {/* Fabric rectangle */}
      <rect x="88" y="136" width="24" height="18" fill="#F5BF20" rx="1" />
      {/* Stitch texture lines horizontal */}
      <line x1="88" y1="140" x2="112" y2="140" stroke="#D8A010" strokeWidth="1.5" opacity="0.7" />
      <line x1="88" y1="144" x2="112" y2="144" stroke="#D8A010" strokeWidth="1.5" opacity="0.7" />
      <line x1="88" y1="148" x2="112" y2="148" stroke="#D8A010" strokeWidth="1.5" opacity="0.7" />
      {/* Stitch texture lines vertical */}
      <line x1="92"  y1="136" x2="92"  y2="154" stroke="#D8A010" strokeWidth="1" opacity="0.4" />
      <line x1="96"  y1="136" x2="96"  y2="154" stroke="#D8A010" strokeWidth="1" opacity="0.4" />
      <line x1="100" y1="136" x2="100" y2="154" stroke="#D8A010" strokeWidth="1" opacity="0.4" />
      <line x1="104" y1="136" x2="104" y2="154" stroke="#D8A010" strokeWidth="1" opacity="0.4" />
      <line x1="108" y1="136" x2="108" y2="154" stroke="#D8A010" strokeWidth="1" opacity="0.4" />

      {/* Yarn from left needle to yarn ball */}
      <path d="M 33 165 Q 18 185 18 202" stroke="#F5BF20" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* ── YARN BALL (bottom-left) ── */}
      <rect x="2"  y="196" width="36" height="36" fill="#E07818" rx="16" />
      <rect x="4"  y="198" width="32" height="32" fill="#F09020" rx="14" />
      <rect x="6"  y="200" width="28" height="28" fill="#F5A030" rx="12" />
      {/* Yarn ball texture */}
      <line x1="2"  y1="214" x2="38" y2="214" stroke="#C06010" strokeWidth="1.5" opacity="0.5" />
      <line x1="20" y1="196" x2="20" y2="232" stroke="#C06010" strokeWidth="1.5" opacity="0.5" />
      <ellipse cx="20" cy="214" rx="10" ry="7" stroke="#C06010" strokeWidth="1.5" fill="none" opacity="0.4" />
      {/* Shine */}
      <rect x="8" y="203" width="8" height="5" fill="#FFCC60" rx="2" opacity="0.5" />

      {/* ── WOODEN TUB EDGE ── */}
      <rect x="0" y="192" width="200" height="16" fill="#6B4020" />
      <rect x="2" y="194" width="196" height="12" fill="#8B5828" />
      {/* Wood slats */}
      {([0, 33, 66, 99, 132, 165] as number[]).map((x, i) => (
        <rect key={i} x={x + 2} y={194} width={27} height={12}
          fill={i % 2 === 0 ? '#9B6430' : '#A87038'} rx="1" />
      ))}
      {/* Tub rim highlight */}
      <rect x="2" y="194" width="196" height="2" fill="#C49050" opacity="0.4" />

      {/* ── WATER ── */}
      <rect x="0" y="208" width="200" height="32" fill="#6AB8D8" />
      <rect x="0" y="212" width="200" height="28" fill="#7CC8E8" />
      {/* Water ripples */}
      <rect x="10"  y="218" width="38" height="3" fill="#9ADAF8" rx="1.5" opacity="0.55" />
      <rect x="80"  y="222" width="48" height="3" fill="#9ADAF8" rx="1.5" opacity="0.55" />
      <rect x="152" y="218" width="36" height="3" fill="#9ADAF8" rx="1.5" opacity="0.5" />

      {/* Tub side walls */}
      <rect x="0"   y="208" width="8" height="32" fill="#7A4820" />
      <rect x="192" y="208" width="8" height="32" fill="#7A4820" />
    </svg>
  );
}
