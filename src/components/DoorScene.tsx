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
    camera.position.set(0, 0, 4.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ----- Lights -----
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85);
    hemi.position.set(0, 10, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // ----- Base door metrics (in world units) -----
    const baseDoorWidth = 1; // base geometry width
    const baseDoorHeight = 2; // base geometry height
    const baseDoorDepth = 0.05;
    const baseGap = 0.25; // gap between doors (in same base units)

    // Create pivots & door meshes (left and right)
    const leftPivot = new THREE.Object3D();
    const rightPivot = new THREE.Object3D();
    scene.add(leftPivot, rightPivot);

    const doorGeo = new THREE.BoxGeometry(
      baseDoorWidth,
      baseDoorHeight,
      baseDoorDepth
    );
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x885544,
      roughness: 0.6,
    });

    const leftDoor = new THREE.Mesh(doorGeo, doorMat);
    const rightDoor = new THREE.Mesh(doorGeo, doorMat);
    // Name them so it's easier to debug in inspector
    leftDoor.name = "leftDoor";
    rightDoor.name = "rightDoor";

    // handles
    const handleGeo = new THREE.SphereGeometry(0.03, 12, 12);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const leftHandle = new THREE.Mesh(handleGeo, handleMat);
    const rightHandle = new THREE.Mesh(handleGeo, handleMat);

    leftDoor.add(leftHandle);
    rightDoor.add(rightHandle);

    leftPivot.add(leftDoor);
    rightPivot.add(rightDoor);

    // Raycaster for clicks
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // state
    let leftOpen = false;
    let rightOpen = false;
    let animatingLeft = false;
    let animatingRight = false;

    // utility: determine whether the intersected object belongs to left or right door
    function doorFromIntersected(
      obj: THREE.Object3D | null
    ): "left" | "right" | null {
      let o: THREE.Object3D | null = obj;
      while (o) {
        if (o === leftDoor) return "left";
        if (o === rightDoor) return "right";
        o = o.parent;
      }
      return null;
    }

    // utility: compute world position of a mesh (cloneless)
    const tmpVec = new THREE.Vector3();
    function worldPosOf(obj: THREE.Object3D, target: THREE.Vector3) {
      obj.getWorldPosition(target);
      return target;
    }

    // Decide which rotation (+90 or -90) will push the door farther from camera
    function chooseOpenTarget(pivot: THREE.Object3D, door: THREE.Mesh) {
      const original = pivot.rotation.y;
      const candidates = [-Math.PI / 2, Math.PI / 2];

      let best = candidates[0];
      let bestDist = -Infinity;

      for (const cand of candidates) {
        pivot.rotation.y = cand;
        const pos = worldPosOf(door, tmpVec);
        const dist = camera.position.distanceTo(pos);
        if (dist > bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
      pivot.rotation.y = original; // restore
      return best;
    }

    function toggleDoor(
      pivot: THREE.Object3D,
      door: THREE.Mesh,
      isOpen: boolean,
      setOpen: (v: boolean) => void,
      setAnimating: (v: boolean) => void,
      animFlag: boolean
    ) {
      if (animFlag) return;
      setAnimating(true);

      const from = { rotY: pivot.rotation.y };

      // choose the open rotation that pushes door away from camera
      const openTarget = chooseOpenTarget(pivot, door);

      const toAngle = isOpen ? 0 : openTarget;

      gsap.to(from, {
        rotY: toAngle,
        duration: 1.0,
        ease: "power3.out",
        onUpdate: () => {
          pivot.rotation.y = from.rotY;
        },
        onComplete: () => {
          setOpen(!isOpen);
          setAnimating(false);
        },
      });
    }

    function toggleLeft() {
      toggleDoor(
        leftPivot,
        leftDoor,
        leftOpen,
        (v) => (leftOpen = v),
        (v) => (animatingLeft = v),
        animatingLeft
      );
    }

    function toggleRight() {
      toggleDoor(
        rightPivot,
        rightDoor,
        rightOpen,
        (v) => (rightOpen = v),
        (v) => (animatingRight = v),
        animatingRight
      );
    }

    function onPointerDown(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // intersect both doors (and their children)
      const intersects = raycaster.intersectObjects(
        [leftDoor, rightDoor],
        true
      );
      if (intersects.length === 0) return;

      const first = intersects[0];
      const which = doorFromIntersected(first.object);
      if (which === "left") {
        toggleLeft();
      } else if (which === "right") {
        toggleRight();
      }
    }

    renderer.domElement.style.cursor = "pointer";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // ----- Responsive sizing & positioning for two doors -----
    const viewportFractionHeight = 0.5; // how much of vertical space the doors can take (tweak)
    const viewportFractionWidth = 0.75; // how much of horizontal space the pair can take (tweak)
    const minScale = 0.2; // avoid vanishing on extremely tiny viewports
    const maxScale = 3.0;

    function updateSizing() {
      if (!mount) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      const distance = Math.abs(camera.position.z - 0); // pivots at z=0
      const vFOV = (camera.fov * Math.PI) / 180;
      const frustumHeight = 2 * distance * Math.tan(vFOV / 2);
      const frustumWidth = frustumHeight * (w / h);

      // available width for both doors + gap
      const availableWidth = frustumWidth * viewportFractionWidth;

      const denom = 2 * baseDoorWidth + baseGap; // in base units
      const scaleFromWidth = availableWidth / denom;

      const desiredDoorHeight = frustumHeight * viewportFractionHeight;
      const scaleFromHeight = desiredDoorHeight / baseDoorHeight;

      let scale = Math.min(scaleFromWidth, scaleFromHeight);
      scale = Math.max(minScale, Math.min(maxScale, scale));

      // compute scaled sizes
      const doorWidthScaled = baseDoorWidth * scale;
      const doorHeightScaled = baseDoorHeight * scale;
      const gapScaled = baseGap * scale;
      const halfTotalWidth = (2 * doorWidthScaled + gapScaled) / 2;

      // centers for left and right door
      const leftCenterX = -(gapScaled / 2 + doorWidthScaled / 2);
      const rightCenterX = gapScaled / 2 + doorWidthScaled / 2;

      // For left door: hinge (pivot) should be at left edge of door -> pivot.x = centerX - halfWidthScaled
      const halfWidth = doorWidthScaled / 2;
      leftPivot.position.set(leftCenterX - halfWidth, 0, 0);
      leftDoor.position.set(halfWidth, 0, 0); // door local center relative to pivot
      leftDoor.scale.set(scale, scale, scale);

      // For right door: hinge at right edge -> pivot.x = centerX + halfWidthScaled
      rightPivot.position.set(rightCenterX + halfWidth, 0, 0);
      // NOTE: door local center is at positive X by default; for right door we want pivot to be on the right edge,
      // so set door.position.x to -halfWidth so door center sits at centerX.
      rightDoor.position.set(-halfWidth, 0, 0);
      rightDoor.scale.set(scale, scale, scale);

      // handles relative to base door coords (child of each door mesh)
      const handleXBase = baseDoorWidth / 2 - 0.12;
      leftHandle.position.set(handleXBase, 0, baseDoorDepth / 2 + 0.03);
      rightHandle.position.set(-handleXBase, 0, baseDoorDepth / 2 + 0.03);

      // small camera nudge on very narrow aspect ratios (optional)
      const aspect = w / h;
      const narrowness = Math.max(0, 1 - Math.min(aspect, 1.2) / 1.2);
      const minCameraZ = 3.2;
      const maxCameraZ = 6.0;
      camera.position.z = minCameraZ + (maxCameraZ - minCameraZ) * narrowness;
      camera.updateProjectionMatrix();
    }

    // initial sizing
    updateSizing();

    // ----- Animation loop -----
    const clock = new THREE.Clock();
    let rafId: number;
    function animate() {
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // resize listener
    function onResize() {
      updateSizing();
    }
    window.addEventListener("resize", onResize);

    // cleanup
    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      if (mount && renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }

      doorGeo.dispose();
      doorMat.dispose();
      handleGeo.dispose();
      handleMat.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
