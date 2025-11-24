import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

/**
 * Creates a TextGeometry with consistent options
 */
export function createTextGeometry(
  text: string,
  font: any,
  size: number
): THREE.BufferGeometry | null {
  if (!font || !text.trim()) return null;
  try {
    const geom = new TextGeometry(text, {
      font: font,
      size: size,
      depth: 0.02,
      curveSegments: 12,
      bevelEnabled: false,
    });
    if (!geom?.attributes?.position || geom.attributes.position.count === 0) {
      geom.dispose();
      return null;
    }
    geom.computeBoundingBox();
    return geom;
  } catch (error) {
    console.warn(`Error creating geometry for "${text}":`, error);
    return null;
  }
}

/**
 * Gets the width of a geometry from its bounding box
 */
export function getGeometryWidth(geom: THREE.BufferGeometry | null): number {
  if (!geom?.boundingBox) return 0;
  const minX = geom.boundingBox!.min.x;
  const maxX = geom.boundingBox!.max.x;
  if (isNaN(minX) || isNaN(maxX)) return 0;
  return maxX - minX;
}

/**
 * Calculates the width of a word using TextGeometry
 */
export function calculateWordWidth(
  word: string,
  font: any,
  size: number
): number {
  const geom = createTextGeometry(word, font, size);
  if (!geom) {
    return size * word.length * 0.5; // Fallback
  }
  const width = getGeometryWidth(geom);
  geom.dispose();
  return width > 0 ? width : size * word.length * 0.5;
}

/**
 * Calculates text center position and dimensions in screen UV space
 */
export function calculateTextBounds(
  mesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera
): { center: THREE.Vector2; size: THREE.Vector2 } {
  if (!mesh.geometry) {
    return {
      center: new THREE.Vector2(-1.0, 0.5),
      size: new THREE.Vector2(0, 0),
    };
  }

  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox();
  }

  const bbox = mesh.geometry.boundingBox!;
  mesh.updateMatrixWorld(true);

  const centerZ = (bbox.min.z + bbox.max.z) * 0.5;
  const corners = [
    new THREE.Vector3(bbox.min.x, bbox.min.y, centerZ),
    new THREE.Vector3(bbox.max.x, bbox.min.y, centerZ),
    new THREE.Vector3(bbox.min.x, bbox.max.y, centerZ),
    new THREE.Vector3(bbox.max.x, bbox.max.y, centerZ),
  ];

  const worldCorners = corners.map((corner) => {
    const worldCorner = corner.clone();
    worldCorner.applyMatrix4(mesh.matrixWorld);
    return worldCorner;
  });

  const screenCorners = worldCorners.map((corner) => {
    const worldPos = corner.clone();
    worldPos.project(camera);
    return new THREE.Vector2(
      0.5 * (worldPos.x + 1.0),
      0.5 * (1.0 - worldPos.y)
    );
  });

  let minX = screenCorners[0].x;
  let maxX = screenCorners[0].x;
  let minY = screenCorners[0].y;
  let maxY = screenCorners[0].y;

  screenCorners.forEach((corner) => {
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
  });

  const size = new THREE.Vector2(maxX - minX, maxY - minY);
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  const center = new THREE.Vector2(centerX, 1.0 - centerY);

  return { center, size };
}
