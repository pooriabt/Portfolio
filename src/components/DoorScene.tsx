"use client";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

import { useDoorSceneSetup } from "./useDoorSceneSetup";

type DoorSceneProps = {
  englishText?: string;
  farsiText?: string;
  englishFontJsonPath?: string;
  farsiFontPath?: string;
  containerHeight?: number | string;
  containerStyle?: React.CSSProperties;
  sceneOffsetY?: number;
};

function applyPerspectiveDistortion(
  geometry: THREE.BufferGeometry,
  perspective: number
) {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const bbox = geometry.boundingBox!;
  const height = bbox.max.y - bbox.min.y;
  const centerY = (bbox.max.y + bbox.min.y) / 2;

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const normalizedY = height > 0 ? (y - centerY) / (height / 2) : 0;
    const scaleX = 1 + perspective * normalizedY;
    const x = positions.getX(i);
    positions.setX(i, x * scaleX);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
}

async function farsifyText(text: string, rtlPlugin: any): Promise<string> {
  if (!rtlPlugin || !text) return text;

  try {
    const shaped = rtlPlugin.applyArabicShaping(text);
    const lines = rtlPlugin.processBidirectionalText(shaped, []);
    return lines.join("\n");
  } catch (error) {
    console.error("Error shaping Farsi text:", error);
    return text;
  }
}

function updatePerspectiveDistortion(
  mesh: THREE.Mesh,
  originalGeom: THREE.BufferGeometry | null,
  perspective: number
) {
  if (!originalGeom || !mesh.geometry) return;

  const originalPositions = originalGeom.attributes.position;
  const currentPositions = mesh.geometry.attributes.position;

  for (let i = 0; i < originalPositions.count; i++) {
    currentPositions.setXYZ(
      i,
      originalPositions.getX(i),
      originalPositions.getY(i),
      originalPositions.getZ(i)
    );
  }

  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox();
  }
  const bbox = mesh.geometry.boundingBox!;
  const height = bbox.max.y - bbox.min.y;
  const centerY = (bbox.max.y + bbox.min.y) / 2;

  for (let i = 0; i < currentPositions.count; i++) {
    const y = currentPositions.getY(i);
    const normalizedY = height > 0 ? (y - centerY) / (height / 2) : 0;
    const scaleX = 1 + perspective * normalizedY;
    const x = currentPositions.getX(i);
    currentPositions.setX(i, x * scaleX);
  }
  currentPositions.needsUpdate = true;
  mesh.geometry.computeBoundingBox();
}

function updateMaterialProperties(
  material: THREE.MeshStandardMaterial,
  controls: any
) {
  material.color.set(controls.color);
  material.opacity = controls.opacity;
  material.transparent = true;
  material.side = THREE.FrontSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.roughness = controls.roughness;
  material.metalness = controls.metalness;
  material.emissive.set(controls.emissiveEnabled ? controls.color : 0x000000);
  material.emissiveIntensity = controls.emissiveEnabled
    ? controls.emissiveIntensity
    : 0;
}

function createGeometryConfigHelper(
  controls: any,
  font: any,
  isFarsi: boolean = false
) {
  const config: any = {
    font,
    size: isFarsi ? controls.fontSize : controls.size,
    depth: controls.depth,
    curveSegments: controls.curveSegments,
  };
  if (controls.bevelEnabled) {
    config.bevelEnabled = true;
    config.bevelThickness = controls.bevelThickness;
    config.bevelSize = controls.bevelSize;
    config.bevelSegments = controls.bevelSegments;
  } else {
    config.bevelEnabled = false;
  }
  return config;
}

function createTextMaterialHelper(controls: any) {
  return new THREE.MeshStandardMaterial({
    color: controls.color,
    emissive: controls.emissiveEnabled ? controls.color : 0x000000,
    emissiveIntensity: controls.emissiveEnabled
      ? controls.emissiveIntensity
      : 0,
    metalness: controls.metalness,
    roughness: controls.roughness,
    opacity: controls.opacity,
    flatShading: false,
    transparent: true,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
  });
}

const ENGLISH_TEXT_CONFIG = Object.freeze({
  size: 0.25,
  depth: 0.07,
  curveSegments: 36,
  bevelEnabled: true,
  bevelThickness: 0.07,
  bevelSize: 0.025,
  bevelSegments: 20,
  posX: 0,
  posY: -0.22,
  posZ: 0,
  rotX: -0.0,
  rotY: 0,
  rotZ: 0,
  verticalPerspective: 0.0,
  color: "#ff5fa8",
  opacity: 1,
  roughness: 0.3,
  metalness: 0,
  emissiveEnabled: true,
  emissiveIntensity: 0.2,
});

const FARSI_TEXT_CONFIG = Object.freeze({
  fontSize: 0.25,
  depth: 0.08,
  curveSegments: 36,
  bevelEnabled: true,
  bevelThickness: 0.08,
  bevelSize: 0.03,
  bevelSegments: 13,
  posX: 0,
  posY: 0.09,
  posZ: 0,
  rotX: 0.0,
  rotY: 0.0,
  rotZ: 0,
  verticalPerspective: 0.0,
  color: "#2d9cdb",
  opacity: 1,
  roughness: 0.3,
  metalness: 0,
  emissiveEnabled: true,
  emissiveIntensity: 0.2,
});

export default function DoorScene({
  englishText = "LOVE",
  farsiText = "توکلی",
  englishFontJsonPath = "/assets/fonts/helvetiker_regular.typeface.json",
  farsiFontPath = "/assets/fonts/Mj Silicon Bold.typeface.json",
  containerHeight = "100vh",
  containerStyle,
  sceneOffsetY = 0,
}: DoorSceneProps = {}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const englishMeshRef = useRef<THREE.Mesh | null>(null);
  const originalGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const fontRef = useRef<any>(null);
  const textGroupRef = useRef<THREE.Group | null>(null);
  const farsiMeshRef = useRef<THREE.Mesh | null>(null);
  const farsiOriginalGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const farsiFontRef = useRef<any>(null);
  const rtlTextPluginRef = useRef<any>(null);
  const textControls = ENGLISH_TEXT_CONFIG;
  const farsiTextControls = FARSI_TEXT_CONFIG;
  const [transitionActive, setTransitionActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handlePortalTransition = (url: string) => {
    setTransitionActive(true);
    
    // Fade in the white overlay
    if (overlayRef.current) {
      gsap.to(overlayRef.current, {
        opacity: 1,
        duration: 1.0,
        ease: "power2.inOut",
        onComplete: () => {
          window.location.assign(url);
        },
      });
    } else {
      // Fallback if ref is missing
      window.location.assign(url);
    }
  };

  useDoorSceneSetup({
    mountRef,
    sceneOffsetY,
    englishText,
    farsiText,
    englishFontJsonPath,
    farsiFontPath,
    textControls,
    farsiTextControls,
    englishMeshRef,
    originalGeometryRef,
    fontRef,
    textGroupRef,
    farsiMeshRef,
    farsiOriginalGeometryRef,
    farsiFontRef,
    rtlTextPluginRef,
    applyPerspectiveDistortion,
    updatePerspectiveDistortion,
    createGeometryConfigHelper,
    createTextMaterialHelper,
    farsifyText,
    onPortalTransition: handlePortalTransition,
  });

  const regenerateGeometry = () => {
    const mesh = englishMeshRef.current;
    const font = fontRef.current;
    const textGroup = textGroupRef.current;

    if (!mesh || !font || !textGroup || !englishText) return;

    const controls = textControls as any;
    textGroup.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => (m as THREE.Material).dispose());
    } else {
      mesh.material.dispose();
    }

    const geomConfig = createGeometryConfigHelper(controls, font, false);
    const geom = new TextGeometry(englishText, geomConfig);
    geom.computeBoundingBox();
    geom.center();

    originalGeometryRef.current = geom.clone();
    applyPerspectiveDistortion(geom, controls.verticalPerspective);

    const mat = createTextMaterialHelper(controls);
    const newMesh = new THREE.Mesh(geom, mat);
    newMesh.position.set(controls.posX, controls.posY, controls.posZ);
    newMesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);
    newMesh.renderOrder = 199;
    newMesh.frustumCulled = false;

    textGroup.add(newMesh);
    englishMeshRef.current = newMesh;
  };

  useEffect(() => {
    const mesh = englishMeshRef.current;
    if (!mesh) return;
    regenerateGeometry();
  }, [englishText]);

  useEffect(() => {
    const mesh = englishMeshRef.current;
    if (!mesh) return;

    const controls = textControls as any;
    mesh.position.set(controls.posX, controls.posY, controls.posZ);
    mesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);

    updatePerspectiveDistortion(
      mesh,
      originalGeometryRef.current,
      controls.verticalPerspective
    );

    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      updateMaterialProperties(mesh.material, controls);
    }
  }, [englishText]);

  const regenerateFarsiGeometry = async () => {
    const mesh = farsiMeshRef.current;
    const font = farsiFontRef.current;
    const textGroup = textGroupRef.current;

    if (!mesh || !font || !textGroup || !farsiText || !rtlTextPluginRef.current)
      return;

    const controls = farsiTextControls as any;
    textGroup.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => (m as THREE.Material).dispose());
    } else {
      mesh.material.dispose();
    }

    const shapedText = await farsifyText(farsiText, rtlTextPluginRef.current);
    const geomConfig = createGeometryConfigHelper(controls, font, true);
    const geom = new TextGeometry(shapedText, geomConfig);
    geom.computeBoundingBox();
    geom.center();

    farsiOriginalGeometryRef.current = geom.clone();
    applyPerspectiveDistortion(geom, controls.verticalPerspective);

    const mat = createTextMaterialHelper(controls);
    const newMesh = new THREE.Mesh(geom, mat);
    newMesh.position.set(controls.posX, controls.posY, controls.posZ);
    newMesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);
    newMesh.renderOrder = 200;
    newMesh.frustumCulled = false;

    textGroup.add(newMesh);
    farsiMeshRef.current = newMesh;
  };

  useEffect(() => {
    const mesh = farsiMeshRef.current;
    if (!mesh) return;
    regenerateFarsiGeometry();
  }, [farsiText]);

  useEffect(() => {
    const mesh = farsiMeshRef.current;
    if (!mesh) return;

    const controls = farsiTextControls as any;
    mesh.position.set(controls.posX, controls.posY, controls.posZ);
    mesh.rotation.set(controls.rotX, controls.rotY, controls.rotZ);

    updatePerspectiveDistortion(
      mesh,
      farsiOriginalGeometryRef.current,
      controls.verticalPerspective
    );

    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      updateMaterialProperties(mesh.material, controls);
    }
  }, [farsiText]);

  return (
    <>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: containerHeight,
          touchAction: "manipulation",
          ...containerStyle,
        }}
      />
      <div
        ref={overlayRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "white",
          opacity: 0,
          pointerEvents: transitionActive ? "auto" : "none",
          zIndex: 300,
        }}
      />
    </>
  );
}
