// components/DoorScene.jsx
"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";

export default function DoorScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ----- Scene / Camera / Renderer -----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f6);

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.6, 4); // slightly above ground, pulled back

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ----- Lights -----
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
    hemi.position.set(0, 10, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    dir.castShadow = true;
    scene.add(dir);

    // ----- Floor plane so door has reference (optional, subtle) -----
    const planeGeo = new THREE.PlaneGeometry(20, 20);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 1,
    });
    const floor = new THREE.Mesh(planeGeo, planeMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // ----- Door pivot trick -----
    // We'll create a pivot Object3D at the hinge location (left edge).
    // The door mesh will be positioned relative to the pivot so rotation looks like a real hinge.

    // Door parameters
    const doorWidth = 1; // units
    const doorHeight = 2; // units
    const doorDepth = 0.05;

    // Pivot at origin (0,0,0). We'll place pivot at x = -doorWidth/2 so hinge sits at that x
    // (you can choose pivot coordinates differently; this approach keeps pivot at scene origin).
    const pivot = new THREE.Object3D();
    pivot.position.set(0, doorHeight / 2, 0); // place pivot at the vertical middle of door base height
    scene.add(pivot);

    // Door geometry is centered on its local origin. To make hinge at left edge,
    // we shift the door mesh to the right by doorWidth/2 relative to pivot.
    const doorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x885544,
      roughness: 0.6,
    });
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);

    // shift the door so its left edge is at x = 0 in pivot-local coordinates
    doorMesh.position.x = doorWidth / 2; // move right so left edge lines up with pivot's x=0
    doorMesh.position.y = -doorHeight / 2; // because pivot y is at door top center; align base at y=0
    // Slightly raise so bottom sits on floor (if pivot y chosen differently adjust)
    doorMesh.position.y += 0; // tweak if needed

    // Optionally add a simple handle (sphere)
    const handleGeo = new THREE.SphereGeometry(0.03, 12, 12);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(
      doorWidth - 0.15,
      doorMesh.position.y,
      doorDepth / 2 + 0.02
    );
    doorMesh.add(handle);

    pivot.add(doorMesh);

    // ----- Raycaster for click detection -----
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let isOpen = false;
    let animating = false;

    function onPointerDown(event: { clientX: number; clientY: number }) {
      // compute pointer normalized device coords (-1 to +1) relative to renderer DOM element
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObject(doorMesh, true);
      if (intersects.length > 0 && !animating) {
        toggleDoor();
      }
    }

    function toggleDoor() {
      animating = true;
      const from = { rotY: pivot.rotation.y };
      // open to -Math.PI/2 (90 degrees) or close to 0
      const to = { rotY: isOpen ? 0 : -Math.PI / 2 };
      gsap.to(from, {
        rotY: to.rotY,
        duration: 1.0,
        ease: "power3.out",
        onUpdate: () => {
          pivot.rotation.y = from.rotY;
        },
        onComplete: () => {
          isOpen = !isOpen;
          animating = false;
        },
      });
    }

    renderer.domElement.style.cursor = "pointer";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // ----- Animation loop -----
    const clock = new THREE.Clock();
    let rafId: number;
    function animate() {
      rafId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      // any subtle animation can go here
      renderer.render(scene, camera);
    }
    animate();

    // ----- Handle Resize -----
    function onResize() {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", onResize);

    // Clean up on unmount
    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      mount.removeChild(renderer.domElement);

      // dispose geometry/materials
      doorGeo.dispose();
      doorMat.dispose();
      handleGeo.dispose();
      handleMat.dispose();
      planeGeo.dispose();
      planeMat.dispose();

      // dispose renderer
      renderer.dispose();
    };
  }, []);

  // container fills available space — style externally
  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100vh",
        touchAction: "none",
        display: "block",
      }}
    />
  );
}
