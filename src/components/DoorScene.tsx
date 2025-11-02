// components/DoorScene.tsx
"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { createArchDoorCanvas } from "./archdoorCanvas";
import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
import { createSpiralBackground } from "./SpiralBackground";
import { createPortalEllipse } from "./createPortalEllipse";
import {
  projectObjectToScreenUv,
  setPortalHoleRadius,
} from "./portalMath";

/**
 * Rick and Morty style portal doors
 * - 2D elliptical portals instead of 3D doors
 * - Each portal displays a texture (arch canvas for left, digital rain for right)
 * - Opening/closing animates with spiral: spreads from center (close), vanishes (open)
 */

export default function DoorScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    let archController: ReturnType<typeof createArchDoorCanvas> | null = null;
    let archTexture: THREE.CanvasTexture | null = null;

    try {
      archController = createArchDoorCanvas(
        [imgC.src, imgA.src, imgB.src],
        1024,
        2048,
        () => {
          if (archTexture) archTexture.needsUpdate = true;
        }
      );
      archController.start?.();
      archTexture = new THREE.CanvasTexture(archController.canvas);
      archTexture.minFilter = THREE.LinearFilter;
      archTexture.magFilter = THREE.LinearFilter;
    } catch (err) {
      console.error("Failed to create arch canvas texture:", err);
    }

    const leftPortal = createPortalEllipse({
      texture: archTexture,
      hue: 0.25,
      useDigitalRain: false,
    });
    const rightPortal = createPortalEllipse({
      texture: null,
      hue: 0.6,
      useDigitalRain: true,
    });

    // Set brush rotation speeds - faster for both portals
    leftPortal.uniforms.uBrushRotation.value = 0.7; // Faster clockwise rotation
    rightPortal.uniforms.uBrushRotation.value = -0.8; // Faster counter-clockwise rotation

    scene.add(leftPortal.mesh, rightPortal.mesh);

    let spiral: ReturnType<typeof createSpiralBackground> | null = null;
    try {
      spiral = createSpiralBackground(
        scene,
        camera,
        renderer,
        leftPortal.mesh,
        rightPortal.mesh
      );
    } catch (err) {
      console.error("Failed to create spiral background:", err);
    }

    // Start with portals closed (showing full texture)
    let leftOpen = true, // true = closed (showing texture)
      rightOpen = true, // true = closed (showing texture)
      animLeft = false,
      animRight = false;

    function togglePortal(
      portal: ReturnType<typeof createPortalEllipse>,
      isOpen: boolean,
      setOpen: (v: boolean) => void,
      setAnimating: (v: boolean) => void,
      animFlag: boolean
    ) {
      if (animFlag) return;
      setAnimating(true);

      // Toggle: if closed (uSpread=1), open it (uSpread=0); if open (uSpread=0), close it (uSpread=1)
      const target = isOpen ? 0 : 1;
      gsap.killTweensOf(portal.uniforms.uSpread);
      gsap.to(portal.uniforms.uSpread, {
        value: target,
        duration: 1.5,
        ease: "power2.inOut",
        onComplete: () => {
          setOpen(!isOpen);
          setAnimating(false);
        },
      });

      // Pulse effect during animation
      gsap.fromTo(
        portal.uniforms.uAlpha,
        { value: 0.8 },
        { value: 1.0, duration: 0.4, yoyo: true, repeat: 1 }
      );
    }

    function toggleLeft() {
      togglePortal(
        leftPortal,
        leftOpen,
        (v) => (leftOpen = v),
        (v) => (animLeft = v),
        animLeft
      );
    }

    function toggleRight() {
      togglePortal(
        rightPortal,
        rightOpen,
        (v) => (rightOpen = v),
        (v) => (animRight = v),
        animRight
      );
    }

    function portalFromIntersected(obj: THREE.Object3D | null) {
      while (obj) {
        if (obj === leftPortal.mesh) return "left";
        if (obj === rightPortal.mesh) return "right";
        obj = obj.parent;
      }
      return null;
    }

    const tmpVec3 = new THREE.Vector3();
    const pointerScreenUv = new THREE.Vector2();

    const pointerInsidePortal = (
      portal: ReturnType<typeof createPortalEllipse>,
      pointerNdc: THREE.Vector2
    ) => {
      pointerScreenUv.set(pointerNdc.x * 0.5 + 0.5, 0.5 * (1.0 - pointerNdc.y));
      const center = portal.uniforms.uCenter.value as THREE.Vector2;
      const hole = portal.uniforms.uHoleRadius.value as THREE.Vector2;
      
      // Check if center and hole are valid
      if (!center || !hole) return false;
      
      const dx = (pointerScreenUv.x - center.x) / hole.x;
      const dy = (pointerScreenUv.y - center.y) / hole.y;
      return dx * dx + dy * dy <= 1.0;
    };

    // Set default cursor
    renderer.domElement.style.cursor = "default";
    
    function onPointerMove(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      // Only raycast against main portal meshes (not children like brushMesh)
      const intersects = raycaster.intersectObjects(
        [leftPortal.mesh, rightPortal.mesh],
        false
      );
      
      if (intersects.length > 0) {
        // Since we're not using recursive raycasting, the object is directly the portal mesh
        const intersectedObj = intersects[0].object;
        const which = intersectedObj === leftPortal.mesh ? "left" : 
                      intersectedObj === rightPortal.mesh ? "right" : null;
        if (which) {
          const portal = which === "left" ? leftPortal : rightPortal;
          // Update portal center before checking (in case it changed)
          projectObjectToScreenUv(
            portal.mesh,
            camera,
            portal.uniforms.uCenter.value as THREE.Vector2,
            tmpVec3
          );
          // Check if pointer is inside the elliptical portal bounds
          if (pointerInsidePortal(portal, pointer)) {
            renderer.domElement.style.cursor = "pointer";
            return;
          }
        }
      }
      renderer.domElement.style.cursor = "default";
    }

    function onPointerDown(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      // Only raycast against main portal meshes (not children like brushMesh)
      const intersects = raycaster.intersectObjects(
        [leftPortal.mesh, rightPortal.mesh],
        false
      );
      if (!intersects.length) return;
      const which = portalFromIntersected(intersects[0].object);
      if (!which) return;

      const portal = which === "left" ? leftPortal : rightPortal;
      // Update portal center before checking (in case it changed)
      projectObjectToScreenUv(
        portal.mesh,
        camera,
        portal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
      if (!pointerInsidePortal(portal, pointer)) return;

      // Show click ellipse for both portals
      if (which === "left") {
        if (archController) archController.showClickEllipse?.();
        toggleLeft();
      }
      if (which === "right") {
        // Show click ellipse on right portal
        portal.uniforms.uShowClickEllipse.value = 1.0;
        setTimeout(() => {
          portal.uniforms.uShowClickEllipse.value = 0.0;
        }, 500);
        toggleRight();
      }
    }

    function updateSizing() {
      if (!mount) return;
      const newWidth = mount.clientWidth || window.innerWidth;
      const newHeight = mount.clientHeight || window.innerHeight;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      const w = renderer.domElement.width;
      const h = renderer.domElement.height;

      if (leftPortal.uniforms.uResolution) {
        leftPortal.uniforms.uResolution.value.set(w, h);
        setPortalHoleRadius(
          leftPortal.uniforms.uHoleRadius.value as THREE.Vector2,
          w,
          h
        );
      }
      if (rightPortal.uniforms.uResolution) {
        rightPortal.uniforms.uResolution.value.set(w, h);
        rightPortal.uniforms.uHoleRadius.value.copy(
          leftPortal.uniforms.uHoleRadius.value as THREE.Vector2
        );
      }

      const holeWidth = (leftPortal.uniforms.uHoleRadius
        .value as THREE.Vector2).x;
      const holeHeight = (leftPortal.uniforms.uHoleRadius
        .value as THREE.Vector2).y;

      // Compute frustum dimensions at portal depth
      const distance = Math.abs(camera.position.z - leftPortal.mesh.position.z);
      const vFov = (camera.fov * Math.PI) / 180;
      const frustumHeight = 2 * distance * Math.tan(vFov / 2);
      const frustumWidth = frustumHeight * camera.aspect;

      const portalWidthWorld = frustumWidth * holeWidth * 2;
      const portalHeightWorld = frustumHeight * holeHeight * 2;

      leftPortal.mesh.scale.set(portalWidthWorld, portalHeightWorld, 1);
      rightPortal.mesh.scale.set(portalWidthWorld, portalHeightWorld, 1);

      // Determine spacing between portals using UV gap
      const gapUv = Math.max(0.06, holeWidth * 0.8);
      const centerDistanceUv = holeWidth * 2 + gapUv;
      const centerOffsetWorld = (frustumWidth * centerDistanceUv) / 2;

      leftPortal.mesh.position.set(-centerOffsetWorld, 0, 0);
      rightPortal.mesh.position.set(centerOffsetWorld, 0, 0);

      if (spiral) spiral.resize();

      // Update centers immediately after resize
      projectObjectToScreenUv(
        leftPortal.mesh,
        camera,
        leftPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
      projectObjectToScreenUv(
        rightPortal.mesh,
        camera,
        rightPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
    }
    updateSizing();
    window.addEventListener("resize", updateSizing);

    // Set up event handlers AFTER sizing is initialized
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const clock = new THREE.Clock();
    let rafId = 0;
    function animate() {
      const elapsed = clock.getElapsedTime();

      projectObjectToScreenUv(
        leftPortal.mesh,
        camera,
        leftPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );
      projectObjectToScreenUv(
        rightPortal.mesh,
        camera,
        rightPortal.uniforms.uCenter.value as THREE.Vector2,
        tmpVec3
      );

      leftPortal.uniforms.uTime.value = elapsed;
      rightPortal.uniforms.uTime.value = elapsed * 1.05;
      if (spiral) spiral.update(elapsed);
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updateSizing);
      if (mount && renderer.domElement.parentElement === mount)
        mount.removeChild(renderer.domElement);

      if (archController) archController.stop?.();
      if (archTexture) archTexture.dispose();
      if (leftPortal.mat) leftPortal.mat.dispose();
      if (rightPortal.mat) rightPortal.mat.dispose();
      renderer.dispose();
      if (spiral) spiral.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100vh", touchAction: "none" }}
    />
  );
}
