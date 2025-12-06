"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import WavyNavHeader from "@/components/WavyNavHeader";

type ContactItem = {
  id: string;
  name: string;
  icon: React.ReactNode;
  href: string;
  glowColor: string;
  accentColor: string;
};

const LinkedInIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-10 h-10 md:w-12 md:h-12"
  >
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const MailIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-10 h-10 md:w-12 md:h-12"
  >
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
  </svg>
);

const TelegramIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-10 h-10 md:w-12 md:h-12"
  >
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const InstagramIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-10 h-10 md:w-12 md:h-12"
  >
    <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
  </svg>
);

const CONTACTS: ContactItem[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: <LinkedInIcon />,
    href: "https://linkedin.com/in/pooriabt",
    glowColor: "#4da6ff",
    accentColor: "#0077B5",
  },
  {
    id: "email",
    name: "Email",
    icon: <MailIcon />,
    href: "https://mail.google.com/mail/?view=cm&to=pooria.tavakoly@gmail.com",
    glowColor: "#ff9999",
    accentColor: "#EA4335",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: <TelegramIcon />,
    href: "https://t.me/pooriabt",
    glowColor: "#66d9ff",
    accentColor: "#0088CC",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: <InstagramIcon />,
    href: "https://instagram.com/pbtarchitects",
    glowColor: "#ff99cc",
    accentColor: "#E1306C",
  },
];

// Generate a single fluffy blob path
function generateFluffyBlob(
  cx: number,
  cy: number,
  baseRadius: number,
  time: number,
  seed: number,
  bumpiness: number = 1
): string {
  const points: { x: number; y: number }[] = [];
  const numPoints = 16;

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    // Multiple waves for organic bumpy edges
    const wave1 = Math.sin(angle * 4 + time * 0.8 + seed) * 8 * bumpiness;
    const wave2 = Math.sin(angle * 7 + time * 1.2 + seed * 1.5) * 5 * bumpiness;
    const wave3 = Math.cos(angle * 3 + time * 0.5 + seed * 2) * 6 * bumpiness;
    const wave4 = Math.sin(angle * 9 + time * 0.3 + seed * 0.7) * 3 * bumpiness;
    const radius = baseRadius + wave1 + wave2 + wave3 + wave4;

    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }

  // Smooth bezier curve
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    const cp1x = p1.x + (p2.x - p0.x) / 5;
    const cp1y = p1.y + (p2.y - p0.y) / 5;
    const cp2x = p2.x - (p3.x - p1.x) / 5;
    const cp2y = p2.y - (p3.y - p1.y) / 5;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  path += " Z";
  return path;
}

// Cloud layer configuration
type CloudLayer = {
  cx: number;
  cy: number;
  radius: number;
  seedOffset: number;
  opacity: number;
  colorType: "highlight" | "mid" | "shadow" | "deep";
  blur: number;
};

// Generate all cloud layers for a realistic fluffy cloud
// Scaled up by 1.4x for bigger clouds
function getCloudLayers(): CloudLayer[] {
  return [
    // Deep shadow core
    {
      cx: 125,
      cy: 106,
      radius: 49,
      seedOffset: 0,
      opacity: 0.9,
      colorType: "deep",
      blur: 0,
    },
    {
      cx: 106,
      cy: 100,
      radius: 42,
      seedOffset: 10,
      opacity: 0.8,
      colorType: "deep",
      blur: 0,
    },
    {
      cx: 144,
      cy: 103,
      radius: 39,
      seedOffset: 20,
      opacity: 0.8,
      colorType: "deep",
      blur: 0,
    },

    // Shadow layer
    {
      cx: 125,
      cy: 94,
      radius: 56,
      seedOffset: 30,
      opacity: 0.7,
      colorType: "shadow",
      blur: 0,
    },
    {
      cx: 88,
      cy: 98,
      radius: 45,
      seedOffset: 40,
      opacity: 0.7,
      colorType: "shadow",
      blur: 0,
    },
    {
      cx: 163,
      cy: 100,
      radius: 42,
      seedOffset: 50,
      opacity: 0.7,
      colorType: "shadow",
      blur: 0,
    },

    // Mid tones - main body
    {
      cx: 125,
      cy: 88,
      radius: 63,
      seedOffset: 60,
      opacity: 0.85,
      colorType: "mid",
      blur: 0,
    },
    {
      cx: 75,
      cy: 90,
      radius: 49,
      seedOffset: 70,
      opacity: 0.8,
      colorType: "mid",
      blur: 0,
    },
    {
      cx: 175,
      cy: 93,
      radius: 46,
      seedOffset: 80,
      opacity: 0.8,
      colorType: "mid",
      blur: 0,
    },
    {
      cx: 100,
      cy: 81,
      radius: 53,
      seedOffset: 90,
      opacity: 0.85,
      colorType: "mid",
      blur: 0,
    },
    {
      cx: 150,
      cy: 84,
      radius: 50,
      seedOffset: 100,
      opacity: 0.85,
      colorType: "mid",
      blur: 0,
    },

    // Highlight edges - top and sides
    {
      cx: 125,
      cy: 69,
      radius: 49,
      seedOffset: 110,
      opacity: 0.95,
      colorType: "highlight",
      blur: 0,
    },
    {
      cx: 88,
      cy: 75,
      radius: 39,
      seedOffset: 120,
      opacity: 0.9,
      colorType: "highlight",
      blur: 0,
    },
    {
      cx: 163,
      cy: 78,
      radius: 36,
      seedOffset: 130,
      opacity: 0.9,
      colorType: "highlight",
      blur: 0,
    },
    {
      cx: 63,
      cy: 88,
      radius: 31,
      seedOffset: 140,
      opacity: 0.85,
      colorType: "highlight",
      blur: 0,
    },
    {
      cx: 188,
      cy: 90,
      radius: 28,
      seedOffset: 150,
      opacity: 0.85,
      colorType: "highlight",
      blur: 0,
    },

    // Top bumps
    {
      cx: 106,
      cy: 63,
      radius: 28,
      seedOffset: 160,
      opacity: 0.95,
      colorType: "highlight",
      blur: 0,
    },
    {
      cx: 144,
      cy: 65,
      radius: 25,
      seedOffset: 170,
      opacity: 0.95,
      colorType: "highlight",
      blur: 0,
    },
  ];
}

// Floating wisps that separate and rejoin
type Wisp = {
  baseX: number;
  baseY: number;
  radius: number;
  seed: number;
  driftAmplitude: number;
  driftSpeed: number;
  phase: number;
};

function getWisps(): Wisp[] {
  // Scaled up by 1.4x
  return [
    {
      baseX: 44,
      baseY: 81,
      radius: 17,
      seed: 200,
      driftAmplitude: 21,
      driftSpeed: 0.4,
      phase: 0,
    },
    {
      baseX: 206,
      baseY: 85,
      radius: 14,
      seed: 210,
      driftAmplitude: 17,
      driftSpeed: 0.5,
      phase: 1,
    },
    {
      baseX: 56,
      baseY: 106,
      radius: 11,
      seed: 220,
      driftAmplitude: 14,
      driftSpeed: 0.6,
      phase: 2,
    },
    {
      baseX: 194,
      baseY: 110,
      radius: 13,
      seed: 230,
      driftAmplitude: 15,
      driftSpeed: 0.45,
      phase: 3,
    },
    {
      baseX: 125,
      baseY: 56,
      radius: 14,
      seed: 240,
      driftAmplitude: 11,
      driftSpeed: 0.35,
      phase: 4,
    },
    {
      baseX: 75,
      baseY: 63,
      radius: 11,
      seed: 250,
      driftAmplitude: 14,
      driftSpeed: 0.55,
      phase: 5,
    },
    {
      baseX: 175,
      baseY: 60,
      radius: 10,
      seed: 260,
      driftAmplitude: 13,
      driftSpeed: 0.5,
      phase: 6,
    },
  ];
}

function RealisticCloud({
  contact,
  index,
}: {
  contact: ContactItem;
  index: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [time, setTime] = useState(0);
  const [mounted, setMounted] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const cloudLayers = useRef(getCloudLayers());
  const wisps = useRef(getWisps());

  useEffect(() => {
    // Mark as mounted first to prevent hydration mismatch
    setMounted(true);

    const startTime = Date.now();
    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      setTime(elapsed);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    window.open(contact.href, "_blank", "noopener,noreferrer");
  }, [contact.href]);

  const baseSeed = index * 1000;

  // Color palette for cloud shading
  const getColor = (type: string, hovered: boolean) => {
    if (hovered) {
      switch (type) {
        case "highlight":
          return contact.glowColor;
        case "mid":
          return `color-mix(in srgb, ${contact.glowColor} 70%, #1a3a5c)`;
        case "shadow":
          return `color-mix(in srgb, ${contact.accentColor} 50%, #0a1929)`;
        case "deep":
          return `color-mix(in srgb, ${contact.accentColor} 30%, #050d14)`;
        default:
          return "#ffffff";
      }
    }
    switch (type) {
      case "highlight":
        return "#e8f4ff";
      case "mid":
        return "#a8c8e8";
      case "shadow":
        return "#5a7a9a";
      case "deep":
        return "#2a3a4a";
      default:
        return "#ffffff";
    }
  };

  return (
    <div
      className="relative cursor-pointer transition-all duration-300 ease-out"
      style={{
        width: "100%",
        height: "100%",
        // transform removed - conflicts with counter-rotate animation
        // filter removed for performance - using SVG internal glow instead
        zIndex: isHovered ? 20 : 5,
        pointerEvents: "auto",
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        setIsHovered(true);
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        setIsHovered(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        handleClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          handleClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Navigate to ${contact.name}`}
    >
      {!mounted ? (
        // Placeholder for SSR and initial client render to prevent hydration mismatch
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ minHeight: "220px" }}
        >
          {/* Invisible placeholder - ensures consistent initial render */}
          <div className="opacity-0">Loading...</div>
        </div>
      ) : (
        // Wrapper for transform that doesn't conflict with rotation animation
        <div
          className="w-full h-full transition-transform duration-300 ease-out"
          style={{
            transform: isHovered ? "scale(1.15) translateY(-12px)" : "scale(1)",
          }}
        >
          {/* Full animated SVG - only rendered after client mount */}
          <svg
            viewBox="0 0 250 180"
            className="w-full h-full" // Changed to w-full h-full to fill container
            style={{
              minHeight: "220px",
              // pointerEvents removed to allow SVG to be the hit target
            }}
          >
            <defs>
              {/* Gooey filter for smooth merging */}
              <filter
                id={`gooey-${contact.id}`}
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur
                  in="SourceGraphic"
                  stdDeviation="3"
                  result="blur"
                />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -12"
                  result="gooey"
                />
              </filter>

              {/* Inner glow */}
              <filter
                id={`inner-glow-${contact.id}`}
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite
                  in="blur"
                  in2="SourceGraphic"
                  operator="in"
                  result="glow"
                />
              </filter>

              {/* Outer glow for hover */}
              <filter
                id={`outer-glow-${contact.id}`}
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
              >
                <feGaussianBlur stdDeviation="7.5" result="blur" />
              </filter>

              {/* Radial gradient for internal lighting */}
              <radialGradient
                id={`internal-light-${contact.id}`}
                cx="50%"
                cy="30%"
                r="60%"
              >
                <stop
                  offset="0%"
                  stopColor={isHovered ? contact.glowColor : "#ffffff"}
                  stopOpacity="0.4"
                />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background glow - always rendered but opacity changes for performance */}
            <ellipse
              cx="125"
              cy="90"
              rx="100"
              ry="63"
              fill={contact.glowColor}
              opacity={isHovered ? 0.5 : 0}
              filter={`url(#outer-glow-${contact.id})`}
              style={{ transition: "opacity 0.3s ease" }}
            />

            {/* Main cloud group with gooey filter */}
            <g filter={`url(#gooey-${contact.id})`}>
              {/* Render all cloud layers from back to front */}
              {cloudLayers.current.map((layer, i) => {
                const path = generateFluffyBlob(
                  layer.cx,
                  layer.cy,
                  layer.radius,
                  time, // Now we can use time directly since this only renders after mount
                  baseSeed + layer.seedOffset,
                  0.8
                );
                return (
                  <path
                    key={`layer-${i}`}
                    d={path}
                    fill={getColor(layer.colorType, isHovered)}
                    opacity={layer.opacity}
                    style={{ transition: "fill 0.5s ease" }}
                  />
                );
              })}

              {/* Floating wisps that separate and rejoin */}
              {wisps.current.map((wisp, i) => {
                // Calculate drift position - wisps float away and back
                const driftCycle = Math.sin(
                  time * wisp.driftSpeed + wisp.phase
                );
                const driftX = wisp.baseX + driftCycle * wisp.driftAmplitude;
                const driftY =
                  wisp.baseY +
                  Math.cos(time * wisp.driftSpeed * 0.7 + wisp.phase) *
                    wisp.driftAmplitude *
                    0.5;

                // Opacity fades as wisp drifts away
                const distanceFromBase = Math.abs(driftCycle);
                const wispOpacity = 0.9 - distanceFromBase * 0.4;

                const path = generateFluffyBlob(
                  driftX,
                  driftY,
                  wisp.radius + Math.sin(time * 2 + wisp.seed) * 2,
                  time,
                  baseSeed + wisp.seed,
                  1.2
                );

                return (
                  <path
                    key={`wisp-${i}`}
                    d={path}
                    fill={getColor("highlight", isHovered)}
                    opacity={wispOpacity}
                    style={{ transition: "fill 0.5s ease" }}
                  />
                );
              })}
            </g>

            {/* Internal lighting effect */}
            <ellipse
              cx="125"
              cy="75"
              rx="63"
              ry="44"
              fill={`url(#internal-light-${contact.id})`}
              style={{ mixBlendMode: "screen" }}
            />

            {/* Highlight specks for extra fluffiness */}
            {[...Array(8)].map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const dist = 38 + Math.sin(time * 0.5 + i) * 12;
              const x = 125 + Math.cos(angle + time * 0.1) * dist;
              const y = 81 + Math.sin(angle + time * 0.1) * dist * 0.6;
              const size = 4 + Math.sin(time + i * 2) * 2;
              return (
                <circle
                  key={`speck-${i}`}
                  cx={x}
                  cy={y}
                  r={size}
                  fill={isHovered ? contact.glowColor : "#ffffff"}
                  opacity={0.6 + Math.sin(time * 2 + i) * 0.3}
                  style={{ transition: "fill 0.5s ease" }}
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* Icon and text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pb-10">
        {/* Icon with strong background for visibility */}
        <div
          className="mb-0.5 relative transition-all duration-500"
          style={{
            transform: isHovered ? "scale(1.2)" : "scale(1)",
          }}
        >
          {/* Outer glow ring */}
          <div
            className="absolute inset-0 rounded-full blur-md transition-all duration-500"
            style={{
              backgroundColor: isHovered
                ? contact.glowColor
                : "rgba(255,255,255,0.3)",
              opacity: isHovered ? 0.6 : 0.4,
              transform: "scale(1.3)",
            }}
          />

          {/* Solid background circle for high contrast */}
          <div
            className="relative rounded-full p-4 md:p-5 transition-all duration-500"
            style={{
              backgroundColor: isHovered
                ? `rgba(255,255,255,0.95)`
                : "rgba(255,255,255,0.9)",
              boxShadow: isHovered
                ? `0 0 40px ${contact.glowColor}90, 0 8px 25px rgba(0,0,0,0.4), inset 0 2px 10px rgba(255,255,255,0.5)`
                : "0 6px 20px rgba(0,0,0,0.5), inset 0 2px 8px rgba(255,255,255,0.3)",
              border: isHovered
                ? `2px solid ${contact.accentColor}`
                : "2px solid rgba(255,255,255,0.3)",
            }}
          >
            {/* Icon with brand color on hover, dark on default for contrast */}
            <div
              style={{
                color: isHovered ? contact.accentColor : "#1a1a2e",
                filter: isHovered
                  ? `drop-shadow(0 0 8px ${contact.glowColor})`
                  : "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
              }}
            >
              {contact.icon}
            </div>
          </div>
        </div>

        {/* Text with better visibility */}
        <span
          className="text-lg md:text-xl font-bold tracking-wide transition-all duration-500"
          style={{
            color: isHovered ? contact.accentColor : "#1a1a2e",
            textShadow: "0 1px 2px rgba(255,255,255,0.5)",
          }}
        >
          {contact.name}
        </span>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const [radius, setRadius] = useState(180);
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const numContacts = CONTACTS.length;

  // Reference dimensions (what you're happy with at the largest size)
  const referenceWidth = 1366; // Reference window width for full-size display
  const baseRadius = 180; // Orbit radius at reference width
  const baseCloudSize = 200; // Cloud size at reference width

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Calculate scale factor based on window width
      // At 1920px or wider, scale = 1. Below that, scale decreases proportionally.
      const widthScale = Math.min(1, width / referenceWidth);

      // On mobile (< 768px), use a smaller scale to fit the vertical layout
      if (width < 768) {
        setIsMobile(true);
        // Scale more aggressively on mobile - use width as the primary factor
        const mobileScale = width / referenceWidth;
        // MOBILE SCALE CONTROLS:
        // - First number (0.7): MAXIMUM scale on mobile
        // - Second number (1.5): MINIMUM scale on mobile
        const currentScale = Math.min(0.7, Math.max(1.5, mobileScale * 2.5));
        setScale(currentScale);
        // Make radius responsive - scale it with the current scale
        setRadius(baseRadius * currentScale);
        return;
      }

      // For desktop: scale everything proportionally
      setIsMobile(false);
      setScale(widthScale);
      setRadius(baseRadius);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    setMounted(true); // Mark as mounted to avoid hydration mismatch
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  // Scaled cloud size for positioning calculations
  const cloudSize = baseCloudSize;

  return (
    <main className="h-screen w-screen bg-black text-white overflow-hidden relative">
      {/* Northern Lights Background */}
      <div className="fixed inset-0 z-0">
        {/* Base dark sky with stars */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#000000] via-[#0a0012] to-[#000000]" />

        {/* Northern Lights - Vertical Rays/Curtains using home page color palette */}
        {/* Left side - Cyan/Teal rays */}
        {[...Array(8)].map((_, i) => {
          const leftPos =
            Math.round((5 + i * 12 + Math.sin(i) * 3) * 100) / 100;
          const width = Math.round((40 + Math.sin(i * 2) * 15) * 100) / 100;
          const clipPath = `polygon(
            ${Math.round((20 + Math.sin(i) * 10) * 100) / 100}% 100%,
            ${Math.round((50 + Math.cos(i) * 15) * 100) / 100}% 80%,
            ${Math.round((45 + Math.sin(i * 2) * 10) * 100) / 100}% 50%,
            ${Math.round((55 + Math.cos(i * 1.5) * 12) * 100) / 100}% 30%,
            ${Math.round((50 + Math.sin(i) * 8) * 100) / 100}% 10%,
            ${Math.round((30 + Math.cos(i * 2) * 10) * 100) / 100}% 0%,
            ${Math.round((10 + Math.sin(i * 1.5) * 8) * 100) / 100}% 0%,
            ${Math.round((15 + Math.cos(i) * 5) * 100) / 100}% 100%
          )`;
          return (
            <div
              key={`cyan-ray-${i}`}
              className="absolute bottom-0"
              style={{
                left: `${leftPos}%`,
                width: `${width}px`,
                height: "70%",
                background: `linear-gradient(
                  180deg,
                  rgba(0, 255, 255, 0) 0%,
                  rgba(0, 255, 255, 0.1) 20%,
                  rgba(102, 255, 255, 0.4) 40%,
                  rgba(0, 255, 255, 0.6) 60%,
                  rgba(0, 255, 255, 0.3) 80%,
                  rgba(0, 255, 255, 0) 100%
                )`,
                clipPath: clipPath,
                filter: "blur(1px)",
                animation: `auroraFlow 15s ease-in-out infinite`,
                animationDelay: `${i * 0.8}s`,
                transformOrigin: "bottom center",
              }}
            />
          );
        })}

        {/* Center/Right side - Magenta/Pink rays */}
        {[...Array(10)].map((_, i) => {
          const leftPos =
            Math.round((45 + i * 5.5 + Math.cos(i) * 2) * 100) / 100;
          const width = Math.round((35 + Math.cos(i * 2) * 12) * 100) / 100;
          const clipPath = `polygon(
            ${Math.round((25 + Math.sin(i) * 12) * 100) / 100}% 100%,
            ${Math.round((55 + Math.cos(i * 1.5) * 18) * 100) / 100}% 75%,
            ${Math.round((50 + Math.sin(i * 2) * 15) * 100) / 100}% 45%,
            ${Math.round((60 + Math.cos(i) * 10) * 100) / 100}% 25%,
            ${Math.round((52 + Math.sin(i * 1.5) * 8) * 100) / 100}% 5%,
            ${Math.round((35 + Math.cos(i * 2) * 12) * 100) / 100}% 0%,
            ${Math.round((15 + Math.sin(i) * 10) * 100) / 100}% 0%,
            ${Math.round((18 + Math.cos(i * 1.5) * 8) * 100) / 100}% 100%
          )`;
          return (
            <div
              key={`magenta-ray-${i}`}
              className="absolute bottom-0"
              style={{
                left: `${leftPos}%`,
                width: `${width}px`,
                height: "75%",
                background: `linear-gradient(
                  180deg,
                  rgba(255, 0, 255, 0) 0%,
                  rgba(255, 0, 255, 0.15) 15%,
                  rgba(255, 102, 255, 0.5) 35%,
                  rgba(255, 0, 255, 0.7) 55%,
                  rgba(255, 51, 255, 0.4) 75%,
                  rgba(255, 0, 255, 0) 100%
                )`,
                clipPath: clipPath,
                filter: "blur(1.5px)",
                animation: `auroraFlow 18s ease-in-out infinite`,
                animationDelay: `${i * 0.6 + 2}s`,
                transformOrigin: "bottom center",
              }}
            />
          );
        })}

        {/* Purple accent rays */}
        {[...Array(6)].map((_, i) => {
          const leftPos =
            Math.round((30 + i * 12 + Math.sin(i * 1.5) * 4) * 100) / 100;
          const width = Math.round((25 + Math.sin(i) * 10) * 100) / 100;
          const clipPath = `polygon(
            ${Math.round((30 + Math.cos(i) * 8) * 100) / 100}% 100%,
            ${Math.round((50 + Math.sin(i * 1.5) * 12) * 100) / 100}% 70%,
            ${Math.round((48 + Math.cos(i * 2) * 10) * 100) / 100}% 40%,
            ${Math.round((52 + Math.sin(i) * 8) * 100) / 100}% 20%,
            ${Math.round((45 + Math.cos(i * 1.5) * 6) * 100) / 100}% 0%,
            ${Math.round((25 + Math.sin(i * 2) * 8) * 100) / 100}% 0%,
            ${Math.round((20 + Math.cos(i) * 5) * 100) / 100}% 100%
          )`;
          return (
            <div
              key={`purple-ray-${i}`}
              className="absolute bottom-0"
              style={{
                left: `${leftPos}%`,
                width: `${width}px`,
                height: "60%",
                background: `linear-gradient(
                  180deg,
                  rgba(153, 0, 255, 0) 0%,
                  rgba(153, 0, 255, 0.2) 25%,
                  rgba(204, 102, 255, 0.4) 50%,
                  rgba(153, 0, 255, 0.3) 75%,
                  rgba(153, 0, 255, 0) 100%
                )`,
                clipPath: clipPath,
                filter: "blur(2px)",
                opacity: 0.6,
                animation: `auroraFlow 20s ease-in-out infinite`,
                animationDelay: `${i * 1.2 + 4}s`,
                transformOrigin: "bottom center",
              }}
            />
          );
        })}

        {/* Horizon glow */}
        <div
          className="absolute bottom-0 left-0 w-full h-1/3 opacity-40"
          style={{
            background: `linear-gradient(
              180deg,
              transparent 0%,
              rgba(255, 0, 255, 0.15) 30%,
              rgba(0, 255, 255, 0.2) 50%,
              rgba(255, 0, 255, 0.15) 70%,
              transparent 100%
            )`,
            filter: "blur(40px)",
            animation: "auroraGlow 8s ease-in-out infinite alternate",
          }}
        />

        {/* Stars - Only render on client to avoid hydration mismatch */}
        {mounted &&
          (() => {
            // Generate stars with seeded random for consistency
            const stars = [];
            for (let i = 0; i < 80; i++) {
              // Use seeded random based on index for consistent positioning
              const seed = i * 123.456;
              const seededRandom = (offset: number) => {
                const x = Math.sin(seed + offset) * 10000;
                return x - Math.floor(x);
              };
              stars.push({
                left: seededRandom(1) * 100,
                top: seededRandom(2) * 100,
                width: 1 + seededRandom(3) * 2,
                height: 1 + seededRandom(4) * 2,
                opacity: 0.4 + seededRandom(5) * 0.6,
                duration: 2 + seededRandom(6) * 4,
                delay: seededRandom(7) * 5,
              });
            }
            return stars.map((star, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${star.left}%`,
                  top: `${star.top}%`,
                  width: `${star.width}px`,
                  height: `${star.height}px`,
                  opacity: star.opacity,
                  animation: `twinkle ${star.duration}s ease-in-out infinite`,
                  animationDelay: `${star.delay}s`,
                }}
              />
            ));
          })()}
      </div>

      {/* Navigation */}
      <WavyNavHeader />

      {/* Main content container */}
      <div className="relative z-10 h-full w-full flex flex-col md:block pt-24 md:pt-0 pb-15 md:pb-0">
        {/* Left side - Description - Vertically centered on desktop */}
        <div className="relative w-full flex items-start justify-center px-6 md:px-0 md:absolute md:left-0 md:top-0 md:h-full md:w-1/2 md:flex md:items-center md:justify-start md:pl-[6%] lg:pl-[9.5%] pt-10 md:pt-16">
          <div className="max-w-xl text-center md:text-left">
            <h1 className="text-3xl md:text-4xl lg:text-7xl font-bold mb-5 bg-gradient-to-r from-[#ff00ff] via-[#00ffff] to-[#ff00ff] bg-clip-text text-transparent m-0">
              Let's Connect
            </h1>
            <div className="space-y-4 text-white/70 text-base md:text-lg leading-relaxed m-0 p-0">
              <p className="m-0 p-0" style={{ textIndent: 0 }}>
                Open to new opportunities and collaborations.
                <br />
                Reach out through any platform on the right.
              </p>
              <p
                className="text-white/50 text-sm md:text-base m-0 p-0"
                style={{ textIndent: 0 }}
              >
                Available for freelance projects and consulting.
              </p>
            </div>
            <div className="mt-7 hidden md:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
              <span className="text-white/60 text-sm">Currently available</span>
            </div>
          </div>
        </div>

        {/* Right side - Orbital clouds container */}
        <div className="relative md:mt-0 h-[360px] sm:h-[420px] w-full md:absolute md:right-0 md:top-0 md:h-full md:w-1/2 flex items-center justify-center">
          {/* Orbital container that rotates - positioned in right half, vertically centered between header and bottom */}
          {/* 
            TO CHANGE CIRCLE CENTER POSITION:
            - Adjust 'left' value (currently "50%") to move horizontally (e.g., "40%" moves left, "60%" moves right)
            - Adjust 'top' value (currently "50%") to move vertically (e.g., "40%" moves up, "60%" moves down)
            
            TO CHANGE ORBIT VELOCITY:
            - Change the duration in 'animation' (currently "30s")
            - Smaller number = faster orbit (e.g., "20s" is faster, "40s" is slower)
            - Also update the counterRotate animation duration to match (currently 30s)
          */}
          {/* Scale wrapper - applies scale transform separately from rotation */}
          <div
            className="absolute"
            style={{
              // Mobile: center horizontally (50%), Desktop: 45% of right half
              left: isMobile ? "50%" : "45%",
              top: "58%", // Vertical position - CHANGE THIS to move circle up/down
              transform: `translate(-50%, -50%) scale(${scale})`,
              pointerEvents: "auto",
            }}
          >
            {/* Rotation container - handles the orbit animation */}
            <div
              style={{
                width: "0",
                height: "0",
                animation: "rotateOrbit 50s linear infinite", // CHANGE "50s" to adjust speed (smaller = faster)
                pointerEvents: "auto",
              }}
            >
            {/* Clouds positioned on circumference */}
            {CONTACTS.map((contact, index) => {
              // Calculate initial angle for each cloud (evenly distributed)
              const initialAngle = (index / numContacts) * 360 - 90; // Start from top, in degrees
              const angleRad = (initialAngle * Math.PI) / 180;
              const x = Math.cos(angleRad) * radius;
              const y = Math.sin(angleRad) * radius;

              return (
                <div
                  key={contact.id}
                  className="absolute"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${cloudSize}px`,
                    height: `${cloudSize}px`,
                    marginLeft: `-${cloudSize / 2}px`,
                    marginTop: `-${cloudSize / 2}px`,
                    animation: `floatIn 0.8s ease-out ${
                      index * 0.15
                    }s forwards`,
                    opacity: 0,
                    pointerEvents: "auto",
                    zIndex: 5,
                  }}
                >
                  {/* Counter-rotate wrapper to keep cloud upright */}
                  {/* NOTE: Change duration here to match rotateOrbit animation above */}
                  <div
                    className="relative"
                    style={{
                      width: "100%",
                      height: "100%",
                      animation: "counterRotate 50s linear infinite", // CHANGE "30s" to match rotateOrbit duration
                      pointerEvents: "auto",
                      zIndex: 10,
                    }}
                  >
                    <RealisticCloud contact={contact} index={index} />
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      </div>

      {/* Keyframes */}
      <style jsx>{`
        @keyframes floatIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes twinkle {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.8;
          }
        }
        @keyframes rotateOrbit {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }
        @keyframes counterRotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(-360deg);
          }
        }
        @keyframes auroraFlow {
          0% {
            transform: translateX(0) scaleX(1) scaleY(1);
            opacity: 0.6;
            filter: blur(1px);
          }
          25% {
            transform: translateX(8px) scaleX(1.1) scaleY(1.05);
            opacity: 0.8;
            filter: blur(1.5px);
          }
          50% {
            transform: translateX(-5px) scaleX(0.95) scaleY(1.1);
            opacity: 0.7;
            filter: blur(2px);
          }
          75% {
            transform: translateX(6px) scaleX(1.05) scaleY(0.98);
            opacity: 0.75;
            filter: blur(1.2px);
          }
          100% {
            transform: translateX(0) scaleX(1) scaleY(1);
            opacity: 0.6;
            filter: blur(1px);
          }
        }
        @keyframes auroraGlow {
          0% {
            opacity: 0.3;
            transform: scaleY(1);
          }
          100% {
            opacity: 0.5;
            transform: scaleY(1.1);
          }
        }
      `}</style>
    </main>
  );
}
