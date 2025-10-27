// components/DoorScene.tsx
"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import createDigitalRainMaterial from "./shaders/DigitalRain";
import { createArchDoorCanvas } from "./archdoorCanvas";
import imgA from "../assets/perse.png";
import imgB from "../assets/ring.png";
import imgC from "../assets/arch-tools.png";
import { createSpiralBackground } from "./SpiralBackground";

export default function DoorScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ---------- basic scene / camera / renderer ----------
    const scene = new THREE.Scene();
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // transparent
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // ---------- geometry / pivots ----------
    const baseDoorWidth = 1;
    const baseDoorHeight = 2;
    const baseDoorDepth = 0.05;
    const baseGap = 0.25;

    const leftPivot = new THREE.Object3D();
    const rightPivot = new THREE.Object3D();
    scene.add(leftPivot, rightPivot);

    // Declare spiral early (will be initialized after doors are created)
    let spiral: ReturnType<typeof createSpiralBackground> | null = null;

    // create a single "base" box geometry and keep it unmodified
    const baseGeo = new THREE.BoxGeometry(
      baseDoorWidth,
      baseDoorHeight,
      baseDoorDepth
    );

    // ---------- materials ----------
    // shader (right door)
    const rainMat = createDigitalRainMaterial();
    rainMat.transparent = true;
    rainMat.depthWrite = true;
    rainMat.blending = THREE.AdditiveBlending;
    if (rainMat.uniforms?.uGlow) rainMat.uniforms.uGlow.value = 1.2;

    // placeholder left material (will become canvas-texture later)
    let leftDoorMat: THREE.MeshStandardMaterial | null =
      new THREE.MeshStandardMaterial({
        color: 0x222222,
        transparent: true,
        // side: THREE.DoubleSide,
        depthWrite: true,
      });

    // ---------- create meshes (clone geometry for independence) ----------
    const leftDoor = new THREE.Mesh(baseGeo.clone(), leftDoorMat);
    const rightDoor = new THREE.Mesh(baseGeo.clone(), rainMat);
    leftDoor.name = "leftDoor";
    rightDoor.name = "rightDoor";

    // Note: DO NOT flip UVs globally here. We keep base geometry UVs unchanged.

    // Add edge geometry for door depth/edges (connecting front to back)
    function addDoorEdges(
      door: THREE.Mesh,
      mat: THREE.MeshStandardMaterial | THREE.Material
    ) {
      const edges = new THREE.Group();

      // Top edge - horizontal plane at top, facing forward
      const topEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(baseDoorWidth, baseDoorDepth),
        mat.clone()
      );
      topEdge.position.set(0, baseDoorHeight / 2, baseDoorDepth / 2 + 0.001);
      edges.add(topEdge);

      // Bottom edge - horizontal plane at bottom, facing forward
      const bottomEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(baseDoorWidth, baseDoorDepth),
        mat.clone()
      );
      bottomEdge.position.set(
        0,
        -baseDoorHeight / 2,
        baseDoorDepth / 2 + 0.001
      );
      edges.add(bottomEdge);

      // Left edge - vertical plane on left, facing forward
      const leftEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(baseDoorDepth, baseDoorHeight),
        mat.clone()
      );
      leftEdge.position.set(-baseDoorWidth / 2 - 0.001, 0, baseDoorDepth / 2);
      leftEdge.rotation.y = Math.PI / 2;
      edges.add(leftEdge);

      // Right edge - vertical plane on right, facing forward
      const rightEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(baseDoorDepth, baseDoorHeight),
        mat.clone()
      );
      rightEdge.position.set(baseDoorWidth / 2 + 0.001, 0, baseDoorDepth / 2);
      rightEdge.rotation.y = -Math.PI / 2;
      edges.add(rightEdge);

      door.add(edges);
      return edges;
    }

    // handles
    const handleGeo = new THREE.SphereGeometry(0.03, 12, 12);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const leftHandle = new THREE.Mesh(handleGeo, handleMat);
    const rightHandle = new THREE.Mesh(handleGeo, handleMat);
    leftDoor.add(leftHandle);
    rightDoor.add(rightHandle);

    // Add edges only for right door (left door edges are transparent - no edge mesh)
    const rightDoorEdges = addDoorEdges(rightDoor, rainMat);

    leftPivot.add(leftDoor);
    rightPivot.add(rightDoor);

    // Ensure doors render on top of spiral background
    leftDoor.renderOrder = 999;
    rightDoor.renderOrder = 999;

    // create spiral background (after doors are created)
    spiral = createSpiralBackground(
      scene,
      camera,
      renderer,
      leftDoor,
      rightDoor
    );

    // ---------- click / open logic (unchanged) ----------
    let leftOpen = false,
      rightOpen = false,
      animLeft = false,
      animRight = false;

    const tmpVec = new THREE.Vector3();
    function worldPosOf(obj: THREE.Object3D, target: THREE.Vector3) {
      obj.getWorldPosition(target);
      return target;
    }

    function chooseOpenTarget(pivot: THREE.Object3D, door: THREE.Mesh) {
      const original = pivot.rotation.y;
      const candidates = [-Math.PI / 2, Math.PI / 2];
      let best = candidates[0],
        bestDist = -Infinity;
      for (const cand of candidates) {
        pivot.rotation.y = cand;
        const pos = worldPosOf(door, tmpVec);
        const dist = camera.position.distanceTo(pos);
        if (dist > bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
      pivot.rotation.y = original;
      return best;
    }

    function tweenPivot(
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
      const target = isOpen ? 0 : chooseOpenTarget(pivot, door);
      gsap.to(from, {
        rotY: target,
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
      tweenPivot(
        leftPivot,
        leftDoor,
        leftOpen,
        (v) => (leftOpen = v),
        (v) => (animLeft = v),
        animLeft
      );
    }
    function toggleRight() {
      tweenPivot(
        rightPivot,
        rightDoor,
        rightOpen,
        (v) => (rightOpen = v),
        (v) => (animRight = v),
        animRight
      );
    }

    function doorFromIntersected(obj: THREE.Object3D | null) {
      while (obj) {
        if (obj === leftDoor) return "left";
        if (obj === rightDoor) return "right";
        obj = obj.parent;
      }
      return null;
    }

    function onPointerDown(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(
        [leftDoor, rightDoor],
        true
      );
      if (!intersects.length) return;
      const which = doorFromIntersected(intersects[0].object);
      if (which === "left") toggleLeft();
      if (which === "right") toggleRight();
    }
    renderer.domElement.style.cursor = "pointer";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // ---------- sizing ----------
    function updateSizing() {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const distance = Math.abs(camera.position.z);
      const vFOV = (camera.fov * Math.PI) / 180;
      const frustumHeight = 2 * distance * Math.tan(vFOV / 2);
      const frustumWidth = frustumHeight * (width / height);

      const viewportFractionHeight = 0.5;
      const viewportFractionWidth = 0.75;
      const minScale = 0.2;
      const maxScale = 3.0;

      const availableWidth = frustumWidth * viewportFractionWidth;
      const denom = 2 * baseDoorWidth + baseGap;
      const scaleFromWidth = availableWidth / denom;
      const scaleFromHeight =
        (frustumHeight * viewportFractionHeight) / baseDoorHeight;
      let scale = Math.min(scaleFromWidth, scaleFromHeight);
      scale = Math.max(minScale, Math.min(maxScale, scale));

      const doorWidthScaled = baseDoorWidth * scale;
      const halfWidth = doorWidthScaled / 2;
      const gapScaled = baseGap * scale;
      const leftCenterX = -(gapScaled / 2 + doorWidthScaled / 2);
      const rightCenterX = gapScaled / 2 + doorWidthScaled / 2;

      // pivot positions & door local centers (note: door.position set relative to pivot)
      leftPivot.position.set(leftCenterX - halfWidth, 0, 0);
      leftDoor.position.set(halfWidth, 0, 0);
      leftDoor.scale.set(scale, scale, scale);

      rightPivot.position.set(rightCenterX + halfWidth, 0, 0);
      rightDoor.position.set(-halfWidth, 0, 0);
      rightDoor.scale.set(scale, scale, scale);

      const handleXBase = baseDoorWidth / 2 - 0.12;
      leftHandle.position.set(handleXBase, 0, baseDoorDepth / 2 + 0.03);
      rightHandle.position.set(-handleXBase, 0, baseDoorDepth / 2 + 0.03);

      camera.position.z =
        3.2 +
        (6.0 - 3.2) * Math.max(0, 1 - Math.min(width / height, 1.2) / 1.2);
      camera.updateProjectionMatrix();

      // update shader resolution (pixel)
      if (rainMat.uniforms?.uResolution) {
        rainMat.uniforms.uResolution.value.set(
          renderer.domElement.width,
          renderer.domElement.height
        );
      }

      // update spiral background
      if (spiral) spiral.resize();
    }
    updateSizing();
    window.addEventListener("resize", updateSizing);

    // ---------- create and assign canvas texture for left door ----------
    let archController: ReturnType<typeof createArchDoorCanvas> | null = null;
    let archTexture: THREE.CanvasTexture | null = null;

    try {
      // create controller
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

      const mat = new THREE.MeshStandardMaterial({
        map: archTexture,
        transparent: true,
        // side: THREE.DoubleSide,
        depthWrite: false,
      });

      if (leftDoorMat) leftDoorMat.dispose();
      leftDoorMat = mat;
      leftDoor.material = leftDoorMat;

      // Update edge materials (left door has no edges - they're transparent)
      // if (leftDoorEdges) {
      //   leftDoorEdges.children.forEach((child) => {
      //     if (child instanceof THREE.Mesh) {
      //       child.material = mat.clone();
      //     }
      //   });
      // }
    } catch (err) {
      console.error("Failed to create arch canvas texture:", err);
    }

    // ---------- animate ----------
    const clock = new THREE.Clock();
    let rafId = 0;
    function animate() {
      const elapsed = clock.getElapsedTime();
      if (spiral) spiral.update(elapsed);
      if (rainMat.uniforms?.uTime) rainMat.uniforms.uTime.value = elapsed;
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // ---------- cleanup ----------
    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updateSizing);
      if (mount && renderer.domElement.parentElement === mount)
        mount.removeChild(renderer.domElement);

      if (archController) archController.stop?.();
      if (archTexture) archTexture.dispose();
      if (leftDoorMat) leftDoorMat.dispose();

      baseGeo.dispose();
      handleGeo.dispose();
      handleMat.dispose();
      rainMat.dispose();
      renderer.dispose();
      if (spiral) spiral.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100vh", touchAction: "none" }}
    />
  );
}
//
