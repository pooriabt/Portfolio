// src/components/ThreeTextSection.tsx
"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { Text } from "troika-three-text";
import { gsap } from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  englishText?: string;
  farsiText?: string;
  englishFontJsonPath?: string; // path to .typeface.json in public
  farsiFontPath?: string; // path to TTF/OTF in public
};

export default function ThreeTextSection({
  englishText = "LOVE",
  farsiText = "پوریا برادران توکلی",

  englishFontJsonPath = "../../public/assets/fonts/Rockybilly_Regular.json",
  farsiFontPath = "../../public/assets/fonts/Mj Silicon Bold.ttf",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = containerRef.current!;
    if (!mount) return;

    // renderer / scene / camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // lights
    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    // container group for both texts
    const group = new THREE.Group();
    scene.add(group);

    // English Text (TextGeometry extruded)
    let englishMesh: THREE.Mesh | null = null;
    const loadEnglish = () =>
      new Promise<void>((resolve, reject) => {
        const loader = new FontLoader();
        loader.load(
          englishFontJsonPath,
          (font) => {
            // TextGeometry options (tune for look)
            const geom = new TextGeometry(englishText, {
              font,
              size: 0.3,
              depth: 0.1, // extrusion depth (changed from height to depth in newer versions)
              curveSegments: 36,
              bevelEnabled: true,
              bevelThickness: 0.07,
              bevelSize: 0.05,
              bevelSegments: 13,
            });
            geom.computeBoundingBox();
            geom.center(); // center geometry

            // Material: toon-like (cartoon shading) or MeshStandardMaterial
            const mat = new THREE.MeshToonMaterial({
              color: 0xff5fa8,
              emissive: 0x2b0d16,
            });

            englishMesh = new THREE.Mesh(geom, mat);
            englishMesh.position.set(-2.0, 0, 0); // left side
            englishMesh.rotation.x = -0.08;
            englishMesh.rotation.y = -0.08;
            group.add(englishMesh);
            resolve();
          },
          undefined,
          (err) => {
            console.error("Font load error:", err);
            reject(err);
          }
        );
      });

    // Farsi text using troika-three-text (supports shaping)
    let farsiObj3D: THREE.Object3D | null = null;
    const loadFarsi = () =>
      new Promise<void>((resolve, reject) => {
        // create a troika Text object
        const troika = new Text();
        troika.text = farsiText;
        troika.font = farsiFontPath; // path to TTF/OTF in public
        troika.fontSize = 1.6; // size
        troika.anchorX = "left"; // we'll position it to the right
        troika.anchorY = "middle";
        troika.material = new THREE.MeshStandardMaterial({ color: 0x2d9cdb });
        // troika supports SDF; `depthOffset` etc can be used for fake 3D; troika also supports outline
        // finalize layout (troika uses onCommit but in three we must call sync)
        troika.sync(); // ensures geometry is created
        troika.position.set(1.4, 0, 0); // right side
        troika.rotation.x = -0.08;
        troika.rotation.y = 0.05;
        group.add(troika);
        farsiObj3D = troika;
        resolve();
      });

    // load both fonts & text
    Promise.all([loadEnglish(), loadFarsi()])
      .then(() => {
        // Setup initial state: texts at bottom, larger scale
        const initialEnglishScale = 2.5;
        const initialFarsiScale = 2.3;

        if (englishMesh) {
          englishMesh.scale.setScalar(initialEnglishScale);
          englishMesh.position.y = -2.5; // Position lower initially
        }

        if (farsiObj3D) {
          farsiObj3D.scale.setScalar(initialFarsiScale);
          farsiObj3D.position.y = -2.5; // Position lower initially
        }

        // Setup GSAP ScrollTrigger animations: Scale and position texts during scroll
        // Trigger based on window scroll (works with Door component above)
        const scrollDistance = window.innerHeight * 2; // Match Door's 200vh height

        if (englishMesh) {
          gsap.to(englishMesh.scale, {
            x: 1.6,
            y: 1.6,
            z: 1.6,
            ease: "none",
            scrollTrigger: {
              trigger: document.body,
              start: "top top",
              end: `+=${scrollDistance}`,
              scrub: 1,
            },
          });

          gsap.to(englishMesh.position, {
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: document.body,
              start: "top top",
              end: `+=${scrollDistance}`,
              scrub: 1,
            },
          });
        }

        // animate troika object (farsi) scale and position on same scroll
        if (farsiObj3D) {
          gsap.to(farsiObj3D.scale, {
            x: 1.4,
            y: 1.4,
            z: 1.4,
            ease: "none",
            scrollTrigger: {
              trigger: document.body,
              start: "top top",
              end: `+=${scrollDistance}`,
              scrub: 1,
            },
          });

          gsap.to(farsiObj3D.position, {
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: document.body,
              start: "top top",
              end: `+=${scrollDistance}`,
              scrub: 1,
            },
          });
        }
      })
      .catch((err) => {
        console.error("Error loading texts", err);
      });

    // Render / animate
    const clock = new THREE.Clock();
    let rafId = 0;
    function animate() {
      const t = clock.getElapsedTime();
      // troika text needs .sync() when you change text or font, but not every frame.
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // resize
    function onResize() {
      const W = mount.clientWidth || window.innerWidth;
      const H = mount.clientHeight || window.innerHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // cleanup
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      // dispose troika object properly
      if (farsiObj3D && (farsiObj3D as any).dispose)
        (farsiObj3D as any).dispose();
      if (englishMesh) {
        englishMesh.geometry.dispose();
        if (Array.isArray(englishMesh.material)) {
          englishMesh.material.forEach((m) => (m as THREE.Material).dispose());
        } else englishMesh.material.dispose();
      }
      // remove renderer dom
      if (mount && renderer.domElement.parentElement === mount)
        mount.removeChild(renderer.domElement);
      renderer.dispose();
      // GSAP cleanup
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, [englishText, farsiText, englishFontJsonPath, farsiFontPath]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        zIndex: 1,
      }}
    />
  );
}
