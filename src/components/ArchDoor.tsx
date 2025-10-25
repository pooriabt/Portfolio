// src/components/ArchDoor.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";

import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
/**
 * ArchDoor (optimized)
 * - PNGs keep transparency and no unwanted box-shadow
 * - Cloud blob moves smoothly and continuously (GPU transforms)
 * - Blob size is fixed (2x biggest), edges soft but lighter for perf
 */
export default function ArchDoor() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aRef = useRef<HTMLImageElement | null>(null);
  const bRef = useRef<HTMLImageElement | null>(null);
  const cRef = useRef<HTMLImageElement | null>(null);
  const blobRef = useRef<SVGSVGElement | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const A = aRef.current!;
    const B = bRef.current!;
    const C = cRef.current!;
    const BLOBSVG = blobRef.current!;
    if (!container || !A || !B || !C || !BLOBSVG) return;

    // --- Container (door-like) ---
    container.style.width = "320px";
    container.style.maxWidth = "22vw";
    container.style.minWidth = "220px";
    container.style.height = "640px";
    container.style.maxHeight = "88vh";
    container.style.position = "relative";
    container.style.margin = "0 auto";
    container.style.overflow = "visible";
    container.style.pointerEvents = "none";

    // --- Images styling ---
    const setImgBase = (el: HTMLElement, css: Partial<CSSStyleDeclaration>) => {
      el.style.position = "absolute";
      el.style.objectFit = "cover";
      el.style.borderRadius = "8px";
      el.style.willChange = "transform, opacity, filter, left, top";
      el.style.background = "transparent"; // keep PNG alpha visible
      el.style.boxShadow = "none"; // remove unwanted shadow
      el.style.filter = "none"; // no default blur (prevents jpeg-like smoothing)
      Object.assign(el.style, css as any);
      // ensure GPU acceleration for transforms
      el.style.transform = el.style.transform || "translateZ(0)";
    };

    setImgBase(A, { left: "8%", top: "8%", width: "52%", height: "auto" });
    setImgBase(B, {
      right: "6%",
      top: "40%",
      width: "58%",
      height: "auto",
      transform: "translateY(-50%)",
    });
    setImgBase(C, { left: "10%", bottom: "8%", width: "48%", height: "auto" });

    // initial states (no blur on PNGs unless affected by blob overlap)
    gsap.set([A, B, C], { opacity: 0.95, filter: "none", scale: 1.0 });
    gsap.set(A, { opacity: 1.0, filter: "none", scale: 1.02 });

    // --- Compute fixed blob radius (2x biggest) ---
    const rect = container.getBoundingClientRect();
    const baseMinR = Math.max(24, Math.min(rect.width, rect.height) * 0.06);
    const baseMaxR = Math.max(80, Math.min(rect.width, rect.height) * 0.28); // slightly smaller max to reduce blur area
    const fixedR = Math.max(baseMaxR, baseMinR) * 2.0;

    // initial center (in px)
    const state = { x: rect.width * 0.5, y: rect.height * 0.5 };

    // --- Prepare static SVG blob: fixed logical size, centered via CSS transform ---
    // Set SVG width/height once (we won't change them per-frame)
    BLOBSVG.setAttribute("width", `${fixedR * 2}`);
    BLOBSVG.setAttribute("height", `${fixedR * 2}`);
    BLOBSVG.style.width = `${fixedR * 2}px`;
    BLOBSVG.style.height = `${fixedR * 2}px`;
    BLOBSVG.style.position = "absolute";
    BLOBSVG.style.left = `${state.x}px`;
    BLOBSVG.style.top = `${state.y}px`;
    BLOBSVG.style.transform = `translate3d(-50%,-50%,0)`; // GPU-friendly

    // smaller Gaussian blur for better perf and less lag (was 28, reduce to 14)
    const fe = BLOBSVG.querySelector("feGaussianBlur");
    if (fe) {
      fe.setAttribute("stdDeviation", "14"); // smoother and faster
    }

    // helper: update SVG translate via transform (GPU)
    function applyBlobPos() {
      BLOBSVG.style.transform = `translate3d(${state.x - fixedR}px, ${
        state.y - fixedR
      }px, 0)`;
      // note: because svg has width=2R, we position its top-left at (x-R, y-R)
      // translate3d ensures GPU compositing (no layout)
    }

    // influence calc: smooth overlap value 0..1
    const influenceFor = (imgEl: HTMLElement) => {
      const cRect = container.getBoundingClientRect();
      const iRect = imgEl.getBoundingClientRect();
      const imgCx = iRect.left - cRect.left + iRect.width / 2;
      const imgCy = iRect.top - cRect.top + iRect.height / 2;
      const dx = imgCx - state.x;
      const dy = imgCy - state.y;
      const d = Math.hypot(dx, dy);
      const outer = fixedR * 1.4; // falloff boundary
      const t = Math.max(0, Math.min(1, d / outer));
      const s = 1 - t; // inside -> near 1
      // smoothstep curve
      return s * s * (3 - 2 * s);
    };

    // update images appearance
    function updateImages() {
      const ia = influenceFor(A);
      const ib = influenceFor(B);
      const ic = influenceFor(C);
      const apply = (el: HTMLElement, inf: number) => {
        // when inf high -> hide (so opacity = 1 - inf)
        const opacity = Math.max(0, Math.min(1, 1 - inf));
        const blurPx = 6 * inf; // subtle blur
        const scale = 1 - 0.06 * inf;
        el.style.opacity = `${opacity}`;
        el.style.filter = `blur(${blurPx}px)`;
        el.style.transform = `translateZ(0) scale(${scale})`;
      };
      apply(A, ia);
      apply(B, ib);
      apply(C, ic);
    }

    // --- continuous smooth random-walk motion (faster, smoother) ---
    let running = true;
    const area = () => {
      const r = container.getBoundingClientRect();
      const margin = 0.12; // keep blob comfortably inside door
      return {
        minX: r.width * margin,
        maxX: r.width * (1 - margin),
        minY: r.height * margin,
        maxY: r.height * (1 - margin),
      };
    };
    const rand = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    function stepToNext() {
      if (!running) return;
      const a = area();
      const target = {
        x: rand(a.minX, a.maxX),
        y: rand(a.minY, a.maxY),
      };
      // faster durations than before, but still smooth
      const duration = rand(0.9, 1.6); // 0.9..1.6 sec
      // kill previous tween if present
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
      tweenRef.current = gsap.to(state, {
        x: target.x,
        y: target.y,
        duration,
        ease: "sine.inOut",
        onUpdate: () => {
          // apply position using GPU transform and adjust images
          applyBlobPos();
          updateImages();
        },
        onComplete: () => {
          // immediately start next step (no pause) for continuous motion
          stepToNext();
        },
      });
    }

    // kick off
    applyBlobPos();
    updateImages();
    stepToNext();

    // Resize handler: reposition blob proportionally and keep fixed size unchanged
    const onResize = () => {
      const rectNow = container.getBoundingClientRect();
      // keep center positioned relatively
      state.x = Math.max(20, Math.min(rectNow.width - 20, state.x));
      state.y = Math.max(20, Math.min(rectNow.height - 20, state.y));
      applyBlobPos();
      updateImages();
    };
    window.addEventListener("resize", onResize);

    // cleanup on unmount
    return () => {
      running = false;
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // JSX
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "320px",
        maxWidth: "22vw",
        minWidth: "220px",
        height: "640px",
        maxHeight: "88vh",
        margin: "0 auto",
        pointerEvents: "none",
      }}
      aria-hidden
    >
      {/* Top-left (A) */}
      <img
        ref={aRef}
        src={imgA.src}
        alt="texture A"
        draggable={false}
        style={{
          position: "absolute",
          left: "8%",
          top: "8%",
          width: "52%",
          height: "auto",
          borderRadius: 8,
          background: "transparent",
        }}
      />

      {/* Right-center (B) */}
      <img
        ref={bRef}
        src={imgB.src}
        alt="texture B"
        draggable={false}
        style={{
          position: "absolute",
          right: "6%",
          top: "40%",
          width: "58%",
          height: "auto",
          transform: "translateY(-50%)",
          borderRadius: 8,
          background: "transparent",
        }}
      />

      {/* Bottom-left (C) */}
      <img
        ref={cRef}
        src={imgC.src}
        alt="texture C"
        draggable={false}
        style={{
          position: "absolute",
          left: "10%",
          bottom: "8%",
          width: "48%",
          height: "auto",
          borderRadius: 8,
          background: "transparent",
        }}
      />

      {/* SVG blob (cloud-shaped soft blur). Transparent fills so it doesn't paint color. */}
      <svg
        ref={blobRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate3d(-50%,-50%,0)",
          pointerEvents: "none",
          overflow: "visible",
          zIndex: 30,
          willChange: "transform",
        }}
        viewBox={`0 0 ${Math.ceil(1) * 2} ${Math.ceil(1) * 2}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <filter id="blurFilter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" result="g" />
            <feColorMatrix
              in="g"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 0.85 0"
            />
          </filter>
        </defs>

        <g filter="url(#blurFilter)">
          {/* overlapping circles (transparent fills) produce the soft cloud shape */}
          <circle
            cx={Math.round(0.45 * 200)}
            cy={Math.round(0.35 * 200)}
            r={Math.round(0.45 * 200)}
            fill="rgba(255,255,255,0)"
          />
          <circle
            cx={Math.round(0.65 * 200)}
            cy={Math.round(0.55 * 200)}
            r={Math.round(0.36 * 200)}
            fill="rgba(255,255,255,0)"
          />
          <circle
            cx={Math.round(0.3 * 200)}
            cy={Math.round(0.65 * 200)}
            r={Math.round(0.3 * 200)}
            fill="rgba(255,255,255,0)"
          />
          <circle
            cx={Math.round(0.6 * 200)}
            cy={Math.round(0.35 * 200)}
            r={Math.round(0.28 * 200)}
            fill="rgba(255,255,255,0)"
          />
        </g>
      </svg>
    </div>
  );
}
