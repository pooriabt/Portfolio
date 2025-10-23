// components/DoorScene.tsx
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
    scene.background = new THREE.Color("transparent");

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const fov = 45;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
    // We'll place camera on z-axis and look at origin so world center is screen center
    camera.position.set(0, 0, 4.5); // initial camera distance (tweakable)
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ----- Lights -----
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemi.position.set(0, 10, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // ----- Door base "logical" size (world units). We'll scale this based on viewport -----
    const baseDoorWidth = 1; // base geometry width (units)
    const baseDoorHeight = 2; // base geometry height (units)
    const baseDoorDepth = 0.05;

    // pivot will be parent of doorMesh and located at hinge world position.
    const pivot = new THREE.Object3D();
    // We'll place pivot at z = 0, x/y will be set by the centering function.
    pivot.position.set(0, 0, 0);
    scene.add(pivot);

    // Create door geometry (centered at its local origin)
    // Using BoxGeometry centered at origin, we'll position it relative to pivot so the left edge sits at pivot.x
    const doorGeo = new THREE.BoxGeometry(
      baseDoorWidth,
      baseDoorHeight,
      baseDoorDepth
    );
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x885544,
      roughness: 0.6,
    });
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);

    // Handle (small sphere)
    const handleGeo = new THREE.SphereGeometry(0.03, 12, 12);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    // We'll add handle later once we compute final sizes
    // Add door mesh to pivot
    pivot.add(doorMesh);
    doorMesh.add(handle);

    // Raycaster for clicks
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let isOpen = false;
    let animating = false;

    function toggleDoor() {
      animating = true;
      const from = { rotY: pivot.rotation.y };
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

    function onPointerDown(event: PointerEvent) {
      // compute normalized device coords (-1 to +1) relative to renderer DOM element
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObject(doorMesh, true);
      if (intersects.length > 0 && !animating) {
        toggleDoor();
      }
    }

    renderer.domElement.style.cursor = "pointer";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // ----- Centering & responsive sizing logic -----
    // We'll compute a scale factor so the door occupies `viewportFraction` of the view height.
    // The camera frustum height at the door distance is: frustumHeight = 2 * distance * tan(fov/2)
    // desiredDoorHeight = frustumHeight * viewportFraction
    const viewportFraction = 0.45; // door height will be ~45% of the visible height (tweakable)

    // tune these
    const viewportFractionHeight = 0.45; // portion of visible height the door should occupy
    const viewportFractionWidth = 0.6; // portion of visible width the door may occupy
    const minCameraZ = 3.0;
    const maxCameraZ = 6.5; // camera will interpolate between min and max based on aspect ratio clamp

    function updateDoorSizing() {
      // Recompute renderer/camera sizes first
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // distance from camera to pivot (we keep pivot.z === 0)
      const distance = Math.abs(camera.position.z - pivot.position.z);

      // vertical frustum height at that distance
      const vFOV = (camera.fov * Math.PI) / 180; // vertical fov in radians
      const frustumHeight = 2 * distance * Math.tan(vFOV / 2);

      // horizontal frustum width at that distance
      const frustumWidth = frustumHeight * (w / h);

      // desired world-space sizes
      const desiredDoorHeight = frustumHeight * viewportFractionHeight;
      const desiredDoorWidth = frustumWidth * viewportFractionWidth;

      // compute uniform scales for each axis relative to base sizes
      const scaleFromHeight = desiredDoorHeight / baseDoorHeight;
      const scaleFromWidth = desiredDoorWidth / baseDoorWidth;

      // choose the smaller scale so door fits both width and height
      const scale = Math.min(scaleFromHeight, scaleFromWidth);

      // Apply scale to the door mesh (uniform)
      doorMesh.scale.set(scale, scale, scale);

      // Now position pivot and doorMesh so the door center sits at world origin (0,0,0)
      const halfWidthScaled = (baseDoorWidth / 2) * scale;

      pivot.position.x = -halfWidthScaled;
      pivot.position.y = 0; // center vertically
      pivot.position.z = 0;

      doorMesh.position.x = halfWidthScaled;
      doorMesh.position.y = 0;
      doorMesh.position.z = 0;

      // Handle
      const handleX = baseDoorWidth / 2 - 0.12;
      handle.position.set(handleX, 0, baseDoorDepth / 2 + 0.03);

      // Optional: adjust camera z for narrow viewports
      // We'll compute a "narrowness" factor: 1 when very tall/narrow, 0 when wide.
      const aspect = w / h;
      const narrowness = Math.max(0, 1.0 - Math.min(aspect, 1.2) / 1.2); // tweak 1.2 as threshold
      // Interpolate camera z between minCameraZ and maxCameraZ when narrowness grows
      const targetCameraZ = minCameraZ + (maxCameraZ - minCameraZ) * narrowness;
      camera.position.z = targetCameraZ;
      camera.updateProjectionMatrix();
    }

    // initial sizing
    updateDoorSizing();

    // ----- Animation loop -----
    const clock = new THREE.Clock();
    let rafId: number;
    function animate() {
      rafId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      renderer.render(scene, camera);
    }
    animate();

    // Handle resize: update renderer + camera + door sizing
    function onResize() {
      updateDoorSizing();
    }
    window.addEventListener("resize", onResize);

    // Clean up
    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);

      mount.removeChild(renderer.domElement);

      doorGeo.dispose();
      doorMat.dispose();
      handleGeo.dispose && (handleGeo as any).dispose && handleGeo.dispose(); // guard
      handleMat.dispose && (handleMat as any).dispose && handleMat.dispose();

      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
