"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { useControls, Leva } from "leva";

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

  const textControls = useControls("English Text", {
    size: { value: 0.2, min: 0.05, max: 1, step: 0.1 },
    depth: { value: 0.06, min: 0, max: 1, step: 0.05 },
    curveSegments: { value: 36, min: 4, max: 256, step: 4 },
    bevelEnabled: true,
    bevelThickness: {
      value: 0.1,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("English Text.bevelEnabled"),
    },
    bevelSize: {
      value: 0.023,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("English Text.bevelEnabled"),
    },
    bevelSegments: {
      value: 13,
      min: 1,
      max: 16,
      step: 1,
      render: (get) => get("English Text.bevelEnabled"),
    },
    posX: { value: 0.0, min: -5, max: 5, step: 0.1 },
    posY: { value: -0.2, min: -5, max: 5, step: 0.1 },
    posZ: { value: 0.0, min: -5, max: 5, step: 0.1 },
    rotX: { value: -0.0, min: -3.14, max: 3.14, step: 0.01 },
    rotY: { value: 0, min: -3.14, max: 3.14, step: 0.01 },
    rotZ: { value: 0, min: -3.14, max: 3.14, step: 0.01 },
    verticalPerspective: {
      value: 0.0,
      min: -2,
      max: 2,
      step: 0.01,
      label: "Vertical Perspective (Trapezoid)",
    },
    color: "#ff5fa8",
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },
    roughness: { value: 0.3, min: 0, max: 1, step: 0.05 },
    metalness: { value: 0, min: 0, max: 1, step: 0.05 },
    emissiveEnabled: true,
    emissiveIntensity: {
      value: 0.2,
      min: 0,
      max: 2,
      step: 0.05,
      render: (get) => get("English Text.emissiveEnabled"),
    },
  });

  const farsiTextControls = useControls("Farsi Text", {
    fontSize: { value: 0.2, min: 0.05, max: 1, step: 0.05 },
    depth: { value: 0.2, min: 0, max: 1, step: 0.05 },
    curveSegments: { value: 36, min: 4, max: 256, step: 4 },
    bevelEnabled: true,
    bevelThickness: {
      value: 0.07,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("Farsi Text.bevelEnabled"),
    },
    bevelSize: {
      value: 0.03,
      min: 0,
      max: 0.1,
      step: 0.01,
      render: (get) => get("Farsi Text.bevelEnabled"),
    },
    bevelSegments: {
      value: 13,
      min: 1,
      max: 16,
      step: 1,
      render: (get) => get("Farsi Text.bevelEnabled"),
    },
    posX: { value: 0.0, min: -5, max: 5, step: 0.1 },
    posY: { value: 0.1, min: -5, max: 5, step: 0.1 },
    posZ: { value: 0.0, min: -5, max: 5, step: 0.1 },
    rotX: { value: 0.0, min: -3.14, max: 3.14, step: 0.01 },
    rotY: { value: 0.0, min: -3.14, max: 3.14, step: 0.01 },
    rotZ: { value: 0, min: -3.14, max: 3.14, step: 0.01 },
    verticalPerspective: {
      value: 0.0,
      min: -2,
      max: 2,
      step: 0.01,
      label: "Vertical Perspective (Trapezoid)",
    },
    color: "#2d9cdb",
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },
    roughness: { value: 0.3, min: 0, max: 1, step: 0.05 },
    metalness: { value: 0, min: 0, max: 1, step: 0.05 },
    emissiveEnabled: true,
    emissiveIntensity: {
      value: 0.2,
      min: 0,
      max: 2,
      step: 0.05,
      render: (get) => get("Farsi Text.emissiveEnabled"),
    },
  });

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
  }, [
    (textControls as any).size,
    (textControls as any).depth,
    (textControls as any).curveSegments,
    (textControls as any).bevelEnabled,
    (textControls as any).bevelThickness,
    (textControls as any).bevelSize,
    (textControls as any).bevelSegments,
    englishText,
  ]);

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
  }, [textControls]);

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
  }, [
    (farsiTextControls as any).fontSize,
    (farsiTextControls as any).depth,
    (farsiTextControls as any).curveSegments,
    (farsiTextControls as any).bevelEnabled,
    (farsiTextControls as any).bevelThickness,
    (farsiTextControls as any).bevelSize,
    (farsiTextControls as any).bevelSegments,
    farsiText,
  ]);

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
  }, [farsiTextControls]);

  return (
    <>
      <Leva collapsed />
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: containerHeight,
          touchAction: "manipulation",
          ...containerStyle,
        }}
      />
    </>
  );
}
