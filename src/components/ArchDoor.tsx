// src/components/ArchDoor.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";

import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
/**
 * Simplified ArchDoor:
 * - narrow portrait container
 * - three PNGs placed top / right-center / bottom
 * - one fixed-size "cloud" SVG with gaussian blur (soft irregular shape)
 * - cloud moves smoothly (continuous random-walk via GSAP)
 * - images fade/blur/scale based on distance to cloud center
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

    // ---------- Layout & visuals ----------
    // container
    Object.assign(container.style, {
      width: "320px",
      maxWidth: "22vw",
      minWidth: "220px",
      height: "640px",
      maxHeight: "88vh",
      position: "relative",
      margin: "0 auto",
      overflow: "visible",
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);

    // images (PNG: keep alpha, no shadow)
    const imgBase = {
      position: "absolute",
      objectFit: "cover",
      borderRadius: "8px",
      background: "transparent",
      boxShadow: "none",
      willChange: "transform, opacity, filter, left, top",
    } as Partial<CSSStyleDeclaration>;

    Object.assign(A.style, imgBase, { left: "8%", top: "8%", width: "52%" });
    Object.assign(B.style, imgBase, {
      right: "6%",
      top: "40%",
      width: "58%",
      transform: "translateY(-50%)",
    });
    Object.assign(C.style, imgBase, {
      left: "10%",
      bottom: "8%",
      width: "48%",
    });

    gsap.set([A, B, C], { opacity: 0.95, filter: "none", scale: 1.0 });
    gsap.set(A, { opacity: 1.0, scale: 1.02 });

    // ---------- Blob size & placement (fixed size = 2x biggest) ----------
    const rect = container.getBoundingClientRect();
    const baseMinR = Math.max(24, Math.min(rect.width, rect.height) * 0.06);
    const baseMaxR = Math.max(80, Math.min(rect.width, rect.height) * 0.28);
    const fixedR = Math.max(baseMaxR, baseMinR) * 2; // fixed radius (px)

    BLOBSVG.setAttribute("width", `${fixedR * 2}`);
    BLOBSVG.setAttribute("height", `${fixedR * 2}`);
    BLOBSVG.style.width = `${fixedR * 2}px`;
    BLOBSVG.style.height = `${fixedR * 2}px`;
    BLOBSVG.style.position = "absolute";
    // initial center
    const state = { x: rect.width * 0.5, y: rect.height * 0.5 };

    // place SVG so its top-left = (x - R, y - R) using GPU transform
    function applyBlobPos() {
      BLOBSVG.style.transform = `translate3d(${state.x - fixedR}px, ${
        state.y - fixedR
      }px, 0)`;
    }
    applyBlobPos();

    // ---------- Influence & image update ----------
    const influence = (imgEl: HTMLElement) => {
      const c = container.getBoundingClientRect();
      const i = imgEl.getBoundingClientRect();
      const cx = i.left - c.left + i.width / 2;
      const cy = i.top - c.top + i.height / 2;
      const d = Math.hypot(cx - state.x, cy - state.y);
      const outer = fixedR * 1.4;
      const t = Math.max(0, Math.min(1, d / outer));
      const s = 1 - t; // inside -> 1
      return s * s * (3 - 2 * s); // smoothstep
    };

    function updateImages() {
      const ia = influence(A);
      const ib = influence(B);
      const ic = influence(C);
      const apply = (el: HTMLElement, inf: number) => {
        const opacity = Math.max(0, Math.min(1, 1 - inf));
        const blurPx = 6 * inf;
        const scale = 1 - 0.06 * inf;
        el.style.opacity = String(opacity);
        el.style.filter = `blur(${blurPx}px)`;
        el.style.transform = `translateZ(0) scale(${scale})`;
      };
      apply(A, ia);
      apply(B, ib);
      apply(C, ic);
    }

    // ---------- Continuous smooth movement (random walk) ----------
    const area = () => {
      const r = container.getBoundingClientRect();
      const m = 0.12;
      return {
        minX: r.width * m,
        maxX: r.width * (1 - m),
        minY: r.height * m,
        maxY: r.height * (1 - m),
      };
    };
    const rand = (a: number, b: number) => Math.random() * (b - a) + a;

    let running = true;
    function step() {
      if (!running) return;
      const a = area();
      const target = { x: rand(a.minX, a.maxX), y: rand(a.minY, a.maxY) };
      const dur = rand(0.9, 1.6);
      if (tweenRef.current) tweenRef.current.kill();
      tweenRef.current = gsap.to(state, {
        x: target.x,
        y: target.y,
        duration: dur,
        ease: "sine.inOut",
        onUpdate: () => {
          applyBlobPos();
          updateImages();
        },
        onComplete: step,
      });
    }
    step(); // start

    // ---------- Resize: keep blob roughly same relative place ----------
    const onResize = () => {
      const rNow = container.getBoundingClientRect();
      state.x = Math.max(20, Math.min(rNow.width - 20, state.x));
      state.y = Math.max(20, Math.min(rNow.height - 20, state.y));
      applyBlobPos();
      updateImages();
    };
    window.addEventListener("resize", onResize);

    // cleanup
    return () => {
      running = false;
      if (tweenRef.current) tweenRef.current.kill();
      window.removeEventListener("resize", onResize);
    };
  }, []);

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
      <img
        ref={aRef}
        src={imgA.src}
        alt="A"
        draggable={false}
        style={{
          position: "absolute",
          left: "8%",
          top: "8%",
          width: "52%",
          borderRadius: 8,
        }}
      />
      <img
        ref={bRef}
        src={imgB.src}
        alt="B"
        draggable={false}
        style={{
          position: "absolute",
          right: "6%",
          top: "40%",
          width: "58%",
          transform: "translateY(-50%)",
          borderRadius: 8,
        }}
      />
      <img
        ref={cRef}
        src={imgC.src}
        alt="C"
        draggable={false}
        style={{
          position: "absolute",
          left: "10%",
          bottom: "8%",
          width: "48%",
          borderRadius: 8,
        }}
      />

      <svg
        ref={blobRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
          overflow: "visible",
          zIndex: 30,
          willChange: "transform",
        }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <filter id="b2" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.85 0"
            />
          </filter>
        </defs>
        <g filter="url(#b2)">
          <circle cx="90" cy="70" r="90" fill="rgba(255,255,255,0)" />
          <circle cx="130" cy="110" r="72" fill="rgba(255,255,255,0)" />
          <circle cx="60" cy="140" r="60" fill="rgba(255,255,255,0)" />
          <circle cx="120" cy="72" r="56" fill="rgba(255,255,255,0)" />
        </g>
      </svg>
    </div>
  );
}
//
