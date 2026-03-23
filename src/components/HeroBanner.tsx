export function HeroBanner() {
  return (
    <div className="hero-banner">
      <div className="hero-illustration">
        <svg
          viewBox="0 0 320 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="hero-svg"
        >
          {/* Room ambient — desk surface */}
          <rect x="0" y="140" width="320" height="40" fill="#0d0d14" />
          <line
            x1="0"
            y1="140"
            x2="320"
            y2="140"
            stroke="#1a1a26"
            strokeWidth="0.5"
          />

          {/* Desk */}
          <rect
            x="60"
            y="128"
            width="200"
            height="14"
            rx="2"
            fill="#111118"
            stroke="#1e1e2a"
            strokeWidth="0.5"
          />
          {/* Desk legs */}
          <rect x="72" y="142" width="3" height="20" fill="#111118" />
          <rect x="245" y="142" width="3" height="20" fill="#111118" />

          {/* Monitor stand */}
          <rect x="152" y="118" width="16" height="12" fill="#16161f" />
          <rect
            x="142"
            y="128"
            width="36"
            height="3"
            rx="1"
            fill="#16161f"
          />

          {/* Monitor frame */}
          <rect
            x="95"
            y="42"
            width="130"
            height="78"
            rx="3"
            fill="#0c0c12"
            stroke="#2a2a38"
            strokeWidth="1"
          />

          {/* Monitor screen */}
          <rect x="100" y="47" width="120" height="68" rx="1" fill="#0a0e14" />

          {/* Screen glow on wall */}
          <ellipse
            cx="160"
            cy="30"
            rx="80"
            ry="30"
            fill="url(#screenGlow)"
            opacity="0.3"
          />

          {/* Mini dashboard on screen */}
          {/* Status bar */}
          <rect x="104" y="50" width="112" height="5" rx="0.5" fill="#12161e" />
          <circle cx="108" cy="52.5" r="1.2" fill="#4a9b6a" />
          <rect x="112" y="51.5" width="20" height="2" rx="0.5" fill="#1e2a22" />

          {/* Mini printer cards */}
          <rect
            x="104"
            y="58"
            width="34"
            height="24"
            rx="1"
            fill="#111822"
            stroke="#1a2430"
            strokeWidth="0.3"
          />
          <rect x="107" y="61" width="12" height="1.5" rx="0.3" fill="#1e2e28" />
          <circle cx="109" cy="61.75" r="0.8" fill="#4a9b6a" opacity="0.8" />
          <rect x="107" y="65" width="28" height="1" rx="0.3" fill="#1a1a26" />
          <rect x="107" y="65" width="18" height="1" rx="0.3" fill="#3d8558" opacity="0.6" />
          <rect x="107" y="69" width="8" height="5" rx="0.5" fill="#0a0e14" />
          <rect x="117" y="69" width="8" height="5" rx="0.5" fill="#0a0e14" />
          <rect x="107" y="76" width="28" height="3" rx="0.5" fill="#0a0e14" opacity="0.5" />

          <rect
            x="143"
            y="58"
            width="34"
            height="24"
            rx="1"
            fill="#111822"
            stroke="#1a2430"
            strokeWidth="0.3"
          />
          <rect x="146" y="61" width="12" height="1.5" rx="0.3" fill="#1e2e28" />
          <circle cx="148" cy="61.75" r="0.8" fill="#4a9b6a" opacity="0.8" />
          <rect x="146" y="65" width="28" height="1" rx="0.3" fill="#1a1a26" />
          <rect x="146" y="65" width="22" height="1" rx="0.3" fill="#3d8558" opacity="0.6" />
          <rect x="146" y="69" width="8" height="5" rx="0.5" fill="#0a0e14" />
          <rect x="156" y="69" width="8" height="5" rx="0.5" fill="#0a0e14" />
          <rect x="146" y="76" width="28" height="3" rx="0.5" fill="#0a0e14" opacity="0.5" />

          <rect
            x="182"
            y="58"
            width="34"
            height="24"
            rx="1"
            fill="#111822"
            stroke="#1a2430"
            strokeWidth="0.3"
          />
          <rect x="185" y="61" width="12" height="1.5" rx="0.3" fill="#2a201e" />
          <circle cx="187" cy="61.75" r="0.8" fill="#b8923a" opacity="0.8" />
          <rect x="185" y="65" width="28" height="1" rx="0.3" fill="#1a1a26" />
          <rect x="185" y="65" width="10" height="1" rx="0.3" fill="#9a7a30" opacity="0.6" />
          <rect x="185" y="69" width="8" height="5" rx="0.5" fill="#0a0e14" />
          <rect x="195" y="69" width="8" height="5" rx="0.5" fill="#0a0e14" />
          <rect x="185" y="76" width="28" height="3" rx="0.5" fill="#0a0e14" opacity="0.5" />

          {/* Bottom chart area on screen */}
          <rect x="104" y="86" width="112" height="24" rx="1" fill="#0c1018" />
          {/* Mini sparkline */}
          <polyline
            points="108,104 116,100 124,102 132,96 140,98 148,92 156,94 164,90 172,93 180,88 188,91 196,86 204,89 212,85"
            stroke="#4a9b6a"
            strokeWidth="0.8"
            fill="none"
            opacity="0.5"
          />
          <polyline
            points="108,104 116,100 124,102 132,96 140,98 148,92 156,94 164,90 172,93 180,88 188,91 196,86 204,89 212,85"
            stroke="none"
            fill="url(#sparkFill)"
            opacity="0.15"
          />

          {/* Screen edge reflection */}
          <rect x="100" y="47" width="120" height="1" fill="#1a2030" opacity="0.5" />

          {/* === Person === */}
          {/* Chair back */}
          <rect
            x="32"
            y="88"
            width="36"
            height="44"
            rx="4"
            fill="#111118"
            stroke="#1e1e2a"
            strokeWidth="0.5"
          />

          {/* Body / torso */}
          <path
            d="M42 100 C42 94, 58 94, 58 100 L60 132 L40 132 Z"
            fill="#16161f"
            stroke="#222230"
            strokeWidth="0.3"
          />

          {/* Neck */}
          <rect x="46" y="86" width="8" height="8" rx="1" fill="#2a2a32" />

          {/* Head */}
          <ellipse cx="50" cy="78" rx="11" ry="12" fill="#2a2a32" />

          {/* Hair */}
          <path
            d="M39 74 C39 66, 50 62, 61 66 C62 70, 61 74, 61 74"
            fill="#1e1e26"
          />

          {/* Ear */}
          <ellipse cx="61" cy="78" rx="2" ry="3" fill="#2a2a32" />

          {/* Eye (looking at screen) */}
          <ellipse cx="54" cy="76" rx="1.5" ry="1" fill="#0a0a10" />
          <circle cx="55" cy="76" r="0.5" fill="#4a9b6a" opacity="0.6" />

          {/* Slight smirk / mouth */}
          <line
            x1="52"
            y1="82"
            x2="56"
            y2="81.5"
            stroke="#1e1e26"
            strokeWidth="0.6"
            strokeLinecap="round"
          />

          {/* Right arm resting on desk */}
          <path
            d="M58 104 C64 108, 70 118, 76 126 L80 130 L74 132 L68 124 C62 116, 56 110, 56 108"
            fill="#16161f"
            stroke="#222230"
            strokeWidth="0.3"
          />

          {/* Left arm holding coffee */}
          <path
            d="M42 104 C38 108, 32 114, 28 120 L26 126"
            stroke="#222230"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M42 104 C38 108, 32 114, 28 120 L26 126"
            stroke="#16161f"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* Coffee mug */}
          <rect
            x="20"
            y="122"
            width="14"
            height="14"
            rx="2"
            fill="#1e1e26"
            stroke="#2a2a38"
            strokeWidth="0.5"
          />
          {/* Mug handle */}
          <path
            d="M34 126 C38 126, 38 132, 34 132"
            stroke="#2a2a38"
            strokeWidth="1"
            fill="none"
          />
          {/* Coffee surface */}
          <ellipse cx="27" cy="124" rx="5.5" ry="1.5" fill="#1a1410" />

          {/* Steam wisps */}
          <path
            d="M24 120 C23 116, 25 114, 24 110"
            stroke="#2a2a38"
            strokeWidth="0.5"
            fill="none"
            opacity="0.4"
            className="steam steam-1"
          />
          <path
            d="M27 119 C28 115, 26 112, 27 108"
            stroke="#2a2a38"
            strokeWidth="0.5"
            fill="none"
            opacity="0.3"
            className="steam steam-2"
          />
          <path
            d="M30 120 C29 117, 31 114, 30 111"
            stroke="#2a2a38"
            strokeWidth="0.4"
            fill="none"
            opacity="0.25"
            className="steam steam-3"
          />

          {/* Legs under desk (barely visible) */}
          <rect x="44" y="132" width="5" height="16" fill="#111118" />
          <rect x="52" y="132" width="5" height="16" fill="#111118" />

          {/* Small plant on desk */}
          <rect
            x="240"
            y="120"
            width="10"
            height="10"
            rx="1"
            fill="#16161f"
            stroke="#1e1e2a"
            strokeWidth="0.3"
          />
          <path
            d="M245 120 C243 114, 241 112, 239 108"
            stroke="#3d5538"
            strokeWidth="1"
            fill="none"
          />
          <path
            d="M245 120 C245 114, 247 110, 249 107"
            stroke="#3d5538"
            strokeWidth="1"
            fill="none"
          />
          <path
            d="M245 118 C247 114, 250 114, 252 112"
            stroke="#3d5538"
            strokeWidth="0.8"
            fill="none"
          />
          <circle cx="239" cy="107" r="2" fill="#2a4030" opacity="0.7" />
          <circle cx="249" cy="106" r="2.2" fill="#2a4030" opacity="0.6" />
          <circle cx="252" cy="111" r="1.8" fill="#2a4030" opacity="0.5" />

          {/* Monitor power LED */}
          <circle cx="160" cy="117" r="0.8" fill="#4a9b6a" opacity="0.5">
            <animate
              attributeName="opacity"
              values="0.3;0.7;0.3"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Ambient particles / dust */}
          <circle cx="280" cy="60" r="0.5" fill="#2a2a38" opacity="0.3">
            <animate
              attributeName="cy"
              values="60;55;60"
              dur="8s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="290" cy="80" r="0.4" fill="#2a2a38" opacity="0.2">
            <animate
              attributeName="cy"
              values="80;74;80"
              dur="10s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="15" cy="50" r="0.5" fill="#2a2a38" opacity="0.2">
            <animate
              attributeName="cy"
              values="50;44;50"
              dur="12s"
              repeatCount="indefinite"
            />
          </circle>

          <defs>
            <radialGradient id="screenGlow" cx="50%" cy="100%">
              <stop offset="0%" stopColor="#4a9b6a" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#4a9b6a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a9b6a" />
              <stop offset="100%" stopColor="#4a9b6a" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="hero-text">
        <h2 className="hero-title">Monitoring the situation</h2>
        <p className="hero-subtitle">Everything is under observation</p>
      </div>
    </div>
  );
}
