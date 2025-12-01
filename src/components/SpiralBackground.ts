// src/components/SpiralBackground.ts
import * as THREE from "three";
import gsap from "gsap";
import { projectObjectToScreenUv, setPortalHoleRadius } from "./portalMath";
import { spiralBackgroundFragmentShader } from "../shaders/spiralBackground.frag";

/**
 * createSpiralBackground(scene, camera, renderer, leftObj, rightObj)
 * - scene/camera/renderer: three core
 * - leftObj/rightObj: objects whose screen positions will become spiral centers
 *
 * Returns: { mesh, update(time), resize(), dispose() }
 */
type SpiralBackgroundOptions = {
  parent?: THREE.Object3D;
};

export function createSpiralBackground(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  leftObj: THREE.Object3D,
  rightObj: THREE.Object3D,
  options?: SpiralBackgroundOptions
) {
  const parent = options?.parent ?? scene;

  // uniforms
  const uniforms = {
    uTime: { value: 0 },
    uResolution: {
      value: new THREE.Vector2(
        renderer.domElement.width,
        renderer.domElement.height
      ),
    },
    uCenter0: { value: new THREE.Vector2(0.25, 0.5) },
    uCenter1: { value: new THREE.Vector2(0.75, 0.5) },
    uHoleRadius: { value: new THREE.Vector2(0.08, 0.08) },
    uHoleRadiusOuter: { value: new THREE.Vector2(0.11, 0.11) },
    uClickScale0: { value: 1.0 },
    uClickScale1: { value: 1.0 },
    uSpeed: { value: 0.7 },
    uBands: { value: 10.0 },
    uContrast: { value: 1.0 },
    // gradient/pulse/scroll uniforms
    uGradientColor: { value: new THREE.Color(0x00bcd4) }, // teal-ish
    // portion from top where gradient starts (0.25 => start at 25% down from top)
    uGradientStartFromTop: { value: 0.25 },
    uGradientStrength: { value: 0.9 },
    uPulseSpeed: { value: 1.8 },
    // 1 at rest, fades to 0 when scrolling
    uScrollFade: { value: 1.0 },
    // flow animation down the triangle
    uGradientFlowSpeed: { value: 0.3 },
    uGradientBandWidth: { value: 0.22 },
    // base half-width of the triangle at its top line (in uv x units)
    uTriBaseHalfWidth: { value: 0.17 },
    // Arrow animation control: 0 = normal, 1 = restart from top
    uArrowAnimationRestart: { value: 0.0 },
    // Time offset for restart animation
    uArrowRestartTime: { value: 0.0 },
    // Starting offset when restart begins (to smoothly transition from current position)
    uArrowRestartStartOffset: { value: 0.0 },
    // Track if restart has ever reached midpoint (to always use restartOffset after that)
    uArrowRestartHasStarted: { value: 0.0 },
    // Arrow animation visibility: 0 = hidden, 1 = visible
    uArrowAnimationVisible: { value: 0.0 },
    // Side text obstacle positions (in screen UV space, 0-1)
    uSideTextLeftPos: { value: new THREE.Vector2(-1.0, 0.5) }, // -1 means not visible
    uSideTextRightPos: { value: new THREE.Vector2(-1.0, 0.5) }, // -1 means not visible
    uSideTextLeftSize: { value: new THREE.Vector2(0.0, 0.0) }, // Width and height of left text in screen UV space
    uSideTextRightSize: { value: new THREE.Vector2(0.0, 0.0) }, // Width and height of right text in screen UV space
    uSideTextObstacleStrength: { value: 0.7 }, // How strong the obstacle effect is
    // Edge angles in radians (0 = horizontal, positive = rotated counterclockwise)
    uSideTextLeftTopAngle: { value: -0.25 }, // Top edge angle for left obstacle
    uSideTextLeftBottomAngle: { value: -0.1 }, // Bottom edge angle for left obstacle
    uSideTextRightTopAngle: { value: 0.25 }, // Top edge angle for right obstacle
    uSideTextRightBottomAngle: { value: 0.1 }, // Bottom edge angle for right obstacle
    // Obstacle rotation in radians (pivots at upper corner)
    uSideTextLeftRotation: { value: -0.2 }, // Rotation for left obstacle (pivot: top-right corner)
    uSideTextRightRotation: { value: 0.2 }, // Rotation for right obstacle (pivot: top-left corner)

    // Trapezoid colors and active state
    uTrapezoidColor: { value: new THREE.Color(0x3d3d3d) }, // Color for white ripples inside trapezoid
    uTrapezoidBlackColor: { value: new THREE.Color(0x020003) }, // Color for black ripples inside trapezoid
    uTrapezoidActive: { value: 0.0 }, // 0 = inactive, 1 = active
    uTrapezoidRightActive: { value: 0.0 }, // 0 = inactive, 1 = active
    uColorInset: { value: 0.0 }, // Inset for color modification (UV space) - 0 = full coverage

    // Left obstacle corner offsets (as percentage of size)
    // Top corners
    uSideTextLeftTopRightCornerOffsetX: { value: 0.0 }, // Move top-right corner right (as percentage of width)
    uSideTextLeftTopRightCornerOffsetY: { value: 0.0 }, // Move top-right corner up (as percentage of height)
    uSideTextLeftTopLeftCornerOffsetX: { value: 0.0 }, // Move top-left corner right (as percentage of width)
    uSideTextLeftTopLeftCornerOffsetY: { value: 0.0 }, // Move top-left corner up (as percentage of height)
    // Bottom corners
    uSideTextLeftBottomRightCornerOffsetX: { value: 0.0 }, // Move bottom-right corner right (as percentage of width)
    uSideTextLeftBottomRightCornerOffsetY: { value: 0.0 }, // Move bottom-right corner up (as percentage of height)
    uSideTextLeftBottomLeftCornerOffsetX: { value: 0.0 }, // Move bottom-left corner right (as percentage of width)
    uSideTextLeftBottomLeftCornerOffsetY: { value: 0.0 }, // Move bottom-left corner up (as percentage of height)
  };

  // vertex shader (pass uv)
  const vertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // fragment shader: two spirals, holes at centers, black/white bands
  const fragment = spiralBackgroundFragmentShader;

  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: uniforms as any,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  // Create a large plane that fills the entire view frustum
  // Since we use screen-space coordinates (gl_FragCoord), the exact size doesn't matter
  // as long as it's large enough to fill the camera's view
  const perspectiveCamera = camera as THREE.PerspectiveCamera;
  const scratchVec3 = new THREE.Vector3();
  const planeDistance = 15; // far behind doors
  let planeHeight = 0;
  let planeWidth = 0;

  function calculatePlaneSize() {
    const fov = (perspectiveCamera.fov * Math.PI) / 180;
    const cameraDistFromOrigin = Math.abs(perspectiveCamera.position.z);
    const totalDistance = cameraDistFromOrigin + planeDistance;
    planeHeight = 2 * Math.tan(fov / 2) * totalDistance;
    planeWidth = planeHeight * perspectiveCamera.aspect;
  }

  calculatePlaneSize();

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    mat
  );
  plane.position.set(0, 0, -planeDistance); // far behind doors
  plane.renderOrder = -999; // render first, before everything
  parent.add(plane);

  // ===== Obstacle meshes with blur-fade effect =====
  // Helper to convert screen UV (0-1) to world position on the spiral plane
  function uvToWorldPos(uv: THREE.Vector2): THREE.Vector3 {
    // UV is in screen space (0-1)
    // IMPORTANT: The shader uses gl_FragCoord.xy / uResolution, which gives:
    // X: 0 = left, 1 = right
    // Y: 0 = bottom, 1 = top (flipped from standard UV where 0=top, 1=bottom)
    // Convert to world position on the plane
    // Plane center is at (0, 0, -planeDistance)
    // Plane extends from -planeWidth/2 to +planeWidth/2 in X
    // Plane extends from -planeHeight/2 to +planeHeight/2 in Y
    // World Y: +Y is up, -Y is down, 0 is center
    const worldX = (uv.x - 0.5) * planeWidth;
    // For shader UV: Y=0 (bottom) -> world -planeHeight/2, Y=1 (top) -> world +planeHeight/2
    const worldY = (uv.y - 0.5) * planeHeight;
    return new THREE.Vector3(worldX, worldY, -planeDistance);
  }

  // Blur-fade shader material for obstacles
  const obstacleVertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const obstacleFragmentShader = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    
    void main() {
      // Make trapezoid completely transparent - it's only used as a detector
      // The spiral shader uses the trapezoid corners to find and color ripples
      discard;
    }
  `;

  const obstacleMaterial = new THREE.ShaderMaterial({
    vertexShader: obstacleVertexShader,
    fragmentShader: obstacleFragmentShader,
    transparent: true,
    opacity: 0.0, // Completely transparent - only used as detector
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {}, // No uniforms needed - mesh is invisible
  });

  // Create obstacle meshes
  let leftObstacleMesh: THREE.Mesh | null = null;
  let rightObstacleMesh: THREE.Mesh | null = null;

  // Edge lines for obstacles (using simple lines)
  const leftObstacleLines: THREE.Line[] = [];
  const rightObstacleLines: THREE.Line[] = [];

  // Line material for obstacle edges - use simple line material
  const edgeLineMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000, // Bright red
    linewidth: 10, // Very thick (may not work on all systems)
    depthTest: false,
    depthWrite: false,
  });

  // Helper to create a simple line between two points
  function createThickLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    thickness: number = 0.05
  ): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geometry, edgeLineMaterial);
    return line;
  }

  // Helper to create or update edge lines
  function updateEdgeLines(
    corners: THREE.Vector2[],
    lines: THREE.Line[],
    groupName: string
  ) {
    // Remove old lines (but don't dispose material - it's shared)
    lines.forEach((line: THREE.Line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      // Don't dispose material - it's shared and reused
    });
    lines.length = 0;

    if (corners.length < 2) {
      return;
    }

    // Create lines connecting corners to form the obstacle edges
    // For C-shape: connect corners in order: 0->1, 1->2, 2->3, 3->0
    const linePairs = [
      [0, 1], // Top edge
      [1, 2], // Left edge
      [2, 3], // Bottom edge
      [3, 0], // Right edge
    ];

    linePairs.forEach(([startIdx, endIdx], lineIndex) => {
      const startCorner = corners[startIdx];
      const endCorner = corners[endIdx];

      const startWorld = uvToWorldPos(startCorner);
      const endWorld = uvToWorldPos(endCorner);

      // Position lines much closer to camera to ensure visibility
      const zPos = planeDistance - 10.0; // Much closer to camera
      const start = new THREE.Vector3(startWorld.x, startWorld.y, zPos);
      const end = new THREE.Vector3(endWorld.x, endWorld.y, zPos);

      const lineMesh = createThickLine(start, end, 0.5);
      lineMesh.renderOrder = 10000; // Extremely high render order to be on top
      lineMesh.frustumCulled = false;
      lineMesh.visible = true;
      lineMesh.name = `${groupName}_edge_${lineIndex}`;

      scene.add(lineMesh);
      lines.push(lineMesh);

      // Add a test sphere at the start position to verify rendering works
      if (lineIndex === 0 && groupName === "left") {
        const testSphere = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        testSphere.position.copy(start);
        testSphere.name = "test_sphere";
        scene.add(testSphere);
        console.log("Added test sphere at:", start);
      }

      // Debug log
      console.log(`Created edge line ${groupName}_${lineIndex}:`, {
        start: {
          x: start.x.toFixed(2),
          y: start.y.toFixed(2),
          z: start.z.toFixed(2),
        },
        end: { x: end.x.toFixed(2), y: end.y.toFixed(2), z: end.z.toFixed(2) },
        length: start.distanceTo(end).toFixed(2),
      });
    });

    console.log(`Created ${lines.length} edge lines for ${groupName} obstacle`);
  }

  // Function to calculate 4 corners of C-shape obstacle in UV space
  // Shape is defined purely by corner positions (no angle calculations)
  function calculateObstacleCorners(
    pos: THREE.Vector2, // Edge position (right edge for left, left edge for right)
    size: THREE.Vector2,
    rotation: number,
    isLeft: boolean,
    topRightCornerOffsetX: number = 0.0, // Offset to move right top corner right (as percentage of width)
    topRightCornerOffsetY: number = 0.0, // Offset to move right top corner up (as percentage of height)
    topLeftCornerOffsetX: number = 0.0, // Offset to move left top corner right (as percentage of width)
    topLeftCornerOffsetY: number = 0.0, // Offset to move left top corner up (as percentage of height)
    bottomRightCornerOffsetX: number = 0.0, // Offset to move bottom corner right (as percentage of width)
    bottomRightCornerOffsetY: number = 0.0, // Offset to move bottom corner up (as percentage of height)
    bottomLeftCornerOffsetX: number = 0.0, // Offset to move left bottom corner right (as percentage of width)
    bottomLeftCornerOffsetY: number = 0.0 // Offset to move left bottom corner up (as percentage of height)
  ): THREE.Vector2[] {
    const halfSize = new THREE.Vector2(size.x * 0.5, size.y * 0.5);

    // Calculate center position in UV space
    const centerX = isLeft ? pos.x - halfSize.x : pos.x + halfSize.x;
    const centerPos = new THREE.Vector2(centerX, pos.y);

    // Define corners directly in local space relative to center
    // No angle calculations - corners are defined by their offsets
    const corners: THREE.Vector2[] = [];
    const cosRot = Math.cos(rotation);
    const sinRot = Math.sin(rotation);

    if (isLeft) {
      // Left obstacle: define corners directly (no angle calculations)
      // Start with base positions in local space relative to center
      const topRightBase = new THREE.Vector2(halfSize.x, halfSize.y);
      const topLeftBase = new THREE.Vector2(-halfSize.x, halfSize.y);
      const bottomRightBase = new THREE.Vector2(halfSize.x, -halfSize.y);
      const bottomLeftBase = new THREE.Vector2(-halfSize.x, -halfSize.y);

      // Apply offsets to base positions
      const topRightCorner = new THREE.Vector2(
        topRightBase.x + topRightCornerOffsetX * size.x,
        topRightBase.y + topRightCornerOffsetY * size.y
      );
      const topLeftCorner = new THREE.Vector2(
        topLeftBase.x + topLeftCornerOffsetX * size.x,
        topLeftBase.y + topLeftCornerOffsetY * size.y
      );
      const bottomRightCorner = new THREE.Vector2(
        bottomRightBase.x + bottomRightCornerOffsetX * size.x,
        bottomRightBase.y + bottomRightCornerOffsetY * size.y
      );
      const bottomLeftCorner = new THREE.Vector2(
        bottomLeftBase.x + bottomLeftCornerOffsetX * size.x,
        bottomLeftBase.y + bottomLeftCornerOffsetY * size.y
      );

      // Apply rotation around top-right corner (rotation center)
      const rotationCenter = topRightCorner.clone();

      // Rotate all corners around the rotation center
      const rotatePoint = (
        point: THREE.Vector2,
        center: THREE.Vector2
      ): THREE.Vector2 => {
        const relative = point.clone().sub(center);
        return new THREE.Vector2(
          relative.x * cosRot - relative.y * sinRot,
          relative.x * sinRot + relative.y * cosRot
        ).add(center);
      };

      const topRightRotated = topRightCorner.clone(); // Rotation center, stays fixed
      const topLeftRotated = rotatePoint(topLeftCorner, rotationCenter);
      const bottomRightRotated = rotatePoint(bottomRightCorner, rotationCenter);
      const bottomLeftRotated = rotatePoint(bottomLeftCorner, rotationCenter);

      corners.push(
        topRightRotated,
        topLeftRotated,
        bottomLeftRotated,
        bottomRightRotated
      );
    } else {
      // Right obstacle: define corners directly (no angle calculations)
      // Start with base positions in local space relative to center
      const topLeftBase = new THREE.Vector2(-halfSize.x, halfSize.y);
      const topRightBase = new THREE.Vector2(halfSize.x, halfSize.y);
      const bottomLeftBase = new THREE.Vector2(-halfSize.x, -halfSize.y);
      const bottomRightBase = new THREE.Vector2(halfSize.x, -halfSize.y);

      // Apply offsets to base positions
      const topLeftCorner = new THREE.Vector2(
        topLeftBase.x + topLeftCornerOffsetX * size.x,
        topLeftBase.y + topLeftCornerOffsetY * size.y
      );
      const topRightCorner = new THREE.Vector2(
        topRightBase.x + topRightCornerOffsetX * size.x,
        topRightBase.y + topRightCornerOffsetY * size.y
      );
      const bottomLeftCorner = new THREE.Vector2(
        bottomLeftBase.x + bottomLeftCornerOffsetX * size.x,
        bottomLeftBase.y + bottomLeftCornerOffsetY * size.y
      );
      const bottomRightCorner = new THREE.Vector2(
        bottomRightBase.x + bottomRightCornerOffsetX * size.x,
        bottomRightBase.y + bottomRightCornerOffsetY * size.y
      );

      // Apply rotation around top-left corner (rotation center)
      const rotationCenter = topLeftCorner.clone();

      // Rotate all corners around the rotation center
      const rotatePoint = (
        point: THREE.Vector2,
        center: THREE.Vector2
      ): THREE.Vector2 => {
        const relative = point.clone().sub(center);
        return new THREE.Vector2(
          relative.x * cosRot - relative.y * sinRot,
          relative.x * sinRot + relative.y * cosRot
        ).add(center);
      };

      const topLeftRotated = topLeftCorner.clone(); // Rotation center, stays fixed
      const topRightRotated = rotatePoint(topRightCorner, rotationCenter);
      const bottomLeftRotated = rotatePoint(bottomLeftCorner, rotationCenter);
      const bottomRightRotated = rotatePoint(bottomRightCorner, rotationCenter);

      corners.push(
        topLeftRotated,
        topRightRotated,
        bottomRightRotated,
        bottomLeftRotated
      );
    }

    // Convert from local space to UV space and add center offset
    return corners.map((corner) => {
      // Corner is in local space relative to center, add center position
      return new THREE.Vector2(centerPos.x + corner.x, centerPos.y + corner.y);
    });
  }

  // Function to update obstacle meshes
  function updateObstacleMeshes() {
    const leftPos = uniforms.uSideTextLeftPos.value;
    const leftSize = uniforms.uSideTextLeftSize.value;
    const rightPos = uniforms.uSideTextRightPos.value;
    const rightSize = uniforms.uSideTextRightSize.value;

    // Update trapezoid active state based on visibility
    if (leftPos.x >= 0.0 && leftSize.x > 0.001 && leftSize.y > 0.001) {
      uniforms.uTrapezoidActive.value = 1.0;
    } else {
      uniforms.uTrapezoidActive.value = 0.0;
    }

    // Right obstacle
    if (rightPos.x >= 0.0 && rightSize.x > 0.001 && rightSize.y > 0.001) {
      uniforms.uTrapezoidRightActive.value = 1.0;
    } else {
      uniforms.uTrapezoidRightActive.value = 0.0;
    }

    // Update left obstacle mesh
    if (leftPos.x >= 0.0 && leftSize.x > 0.001 && leftSize.y > 0.001) {
      // Use positions directly - both shader and calculateTextBounds use Y=0 at bottom
      const corners = calculateObstacleCorners(
        leftPos,
        leftSize,
        uniforms.uSideTextLeftRotation.value,
        true,
        uniforms.uSideTextLeftTopRightCornerOffsetX.value,
        uniforms.uSideTextLeftTopRightCornerOffsetY.value,
        uniforms.uSideTextLeftTopLeftCornerOffsetX.value,
        uniforms.uSideTextLeftTopLeftCornerOffsetY.value,
        uniforms.uSideTextLeftBottomRightCornerOffsetX.value,
        uniforms.uSideTextLeftBottomRightCornerOffsetY.value,
        uniforms.uSideTextLeftBottomLeftCornerOffsetX.value,
        uniforms.uSideTextLeftBottomLeftCornerOffsetY.value
      );

      // Create or update mesh
      if (!leftObstacleMesh) {
        const geometry = new THREE.BufferGeometry();
        leftObstacleMesh = new THREE.Mesh(geometry, obstacleMaterial.clone());
        leftObstacleMesh.renderOrder = -998; // Just after spiral background
        parent.add(leftObstacleMesh);
      }

      // Update geometry with new corners
      const positions = new Float32Array([
        ...uvToWorldPos(corners[0]).toArray(),
        ...uvToWorldPos(corners[1]).toArray(),
        ...uvToWorldPos(corners[2]).toArray(),
        ...uvToWorldPos(corners[0]).toArray(),
        ...uvToWorldPos(corners[2]).toArray(),
        ...uvToWorldPos(corners[3]).toArray(),
      ]);

      const uvs = new Float32Array([
        1.0,
        1.0, // top-right
        0.0,
        1.0, // top-left
        0.0,
        0.0, // bottom-left
        1.0,
        1.0, // top-right
        0.0,
        0.0, // bottom-left
        1.0,
        0.0, // bottom-right
      ]);

      leftObstacleMesh.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      leftObstacleMesh.geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(uvs, 2)
      );
      leftObstacleMesh.geometry.computeVertexNormals();
      leftObstacleMesh.visible = true;

      // Update edge lines
      updateEdgeLines(corners, leftObstacleLines, "left");
    } else if (leftObstacleMesh) {
      leftObstacleMesh.visible = false;
      // Hide edge lines
      leftObstacleLines.forEach((line) => {
        line.visible = false;
      });
    }

    // Update right obstacle mesh (still needed for visual mesh, but trapezoid uses mirrored left corners)
    if (rightPos.x >= 0.0 && rightSize.x > 0.001 && rightSize.y > 0.001) {
      // Use positions directly - both shader and calculateTextBounds use Y=0 at bottom
      const corners = calculateObstacleCorners(
        rightPos,
        rightSize,
        uniforms.uSideTextRightRotation.value,
        false,
        0.0, // topRightCornerOffsetX - right obstacle uses different corner order
        0.0, // topRightCornerOffsetY
        0.0, // topLeftCornerOffsetX
        0.0, // topLeftCornerOffsetY
        0.0, // bottomRightCornerOffsetX
        0.0, // bottomRightCornerOffsetY
        0.0, // bottomLeftCornerOffsetX
        0.0 // bottomLeftCornerOffsetY
      );

      // Create or update mesh
      if (!rightObstacleMesh) {
        const geometry = new THREE.BufferGeometry();
        rightObstacleMesh = new THREE.Mesh(geometry, obstacleMaterial.clone());
        rightObstacleMesh.renderOrder = -998; // Just after spiral background
        parent.add(rightObstacleMesh);
      }

      // Update geometry with new corners
      // Right obstacle corner order: topLeft, topRight, bottomRight, bottomLeft
      const positions = new Float32Array([
        ...uvToWorldPos(corners[0]).toArray(), // topLeft
        ...uvToWorldPos(corners[1]).toArray(), // topRight
        ...uvToWorldPos(corners[2]).toArray(), // bottomRight
        ...uvToWorldPos(corners[0]).toArray(), // topLeft
        ...uvToWorldPos(corners[2]).toArray(), // bottomRight
        ...uvToWorldPos(corners[3]).toArray(), // bottomLeft
      ]);

      const uvs = new Float32Array([
        0.0,
        1.0, // top-left
        1.0,
        1.0, // top-right
        1.0,
        0.0, // bottom-right
        0.0,
        1.0, // top-left
        1.0,
        0.0, // bottom-right
        0.0,
        0.0, // bottom-left
      ]);

      rightObstacleMesh.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      rightObstacleMesh.geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(uvs, 2)
      );
      rightObstacleMesh.geometry.computeVertexNormals();
      rightObstacleMesh.visible = true;

      // Update edge lines
      updateEdgeLines(corners, rightObstacleLines, "right");
    } else if (rightObstacleMesh) {
      rightObstacleMesh.visible = false;
      // Hide edge lines
      rightObstacleLines.forEach((line) => {
        line.visible = false;
      });
    } else {
      // If right obstacle doesn't exist but left does, right trapezoid is still active (mirrored from left)
      // If neither exists, both are inactive (handled in left obstacle else clause above)
    }
  }

  function updateCenters() {
    projectObjectToScreenUv(
      leftObj,
      perspectiveCamera,
      uniforms.uCenter0.value,
      scratchVec3
    );
    projectObjectToScreenUv(
      rightObj,
      perspectiveCamera,
      uniforms.uCenter1.value,
      scratchVec3
    );
  }
  function resize() {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    uniforms.uResolution.value.set(w, h);

    // Compute independent width/height hole scaling
    setPortalHoleRadius(uniforms.uHoleRadius.value, w, h);
    uniforms.uHoleRadiusOuter.value
      .copy(uniforms.uHoleRadius.value)
      .multiplyScalar(1.35);

    // Update plane size
    calculatePlaneSize();

    // Update plane geometry dimensions
    plane.geometry.dispose();
    plane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

    updateCenters();
    // Update obstacle meshes when resizing
    updateObstacleMeshes();
  }

  // Arrow animation state
  let pageLoadTime = Date.now();
  let lastScrollTime = Date.now();
  let arrowRestartTween: gsap.core.Tween | null = null;
  let arrowVisibilityTween: gsap.core.Tween | null = null;
  let isScrolling = false;
  let restartTimeOffset = 0.0; // Time offset to reset animation when restarting
  let hasStartedRestartAnimation = false; // Flag to prevent resetting restartTimeOffset every frame
  let isAtBottom = false; // Track if user is at the bottom of the page

  // Helper function to check if user is at the bottom of the page
  function checkIfAtBottom(): boolean {
    if (typeof window === "undefined") return false;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    // Consider at bottom if within 50px of the bottom
    const threshold = 50;
    return scrollTop + clientHeight >= scrollHeight - threshold;
  }

  function update(timeSec: number) {
    uniforms.uTime.value = timeSec;
    updateCenters();
    // Update obstacle meshes every frame to ensure trapezoid corners stay aligned
    updateObstacleMeshes();

    // Arrow animation: after 5 seconds of no scroll, show and restart from top
    const currentTime = Date.now();
    const timeSinceLoad = (currentTime - pageLoadTime) / 1000;
    const timeSinceScroll = (currentTime - lastScrollTime) / 1000;

    // Update restart time continuously as long as animation is active
    // This MUST run every frame once started to keep animation looping
    // Start from 0.0 and continuously increase, wrapping naturally from 1.0 to 0.0
    if (restartTimeOffset > 0.0) {
      // Ensure restart stays at 1.0 to keep animation active
      uniforms.uArrowAnimationRestart.value = 1.0;
      // Only ensure visibility stays at 1.0 if we're not scrolling
      // Since restartTimeOffset is reset to 0 on scroll, this check prevents resetting during fade-out
      if (!isScrolling && uniforms.uArrowAnimationVisible.value > 0.01) {
        uniforms.uArrowAnimationVisible.value = 1.0;
      }
      // Calculate restart time: current time minus offset, so it starts from 0
      // This ensures restartOffset continuously increases from 0.0 to 1.0, then wraps to 0.0
      // The direction is always forward (increasing) because timeSec always increases
      // When it wraps, it naturally jumps back to 0.0 (top) and continues
      // This continues indefinitely until restartTimeOffset is reset (on scroll)
      // CRITICAL: This must update every frame to keep the animation looping
      const calculatedRestartTime = timeSec - restartTimeOffset;
      // Ensure restartTime is always updating (should always be >= 0 and increasing)
      uniforms.uArrowRestartTime.value = Math.max(0.0, calculatedRestartTime);
    }

    // Check if user is at the bottom of the page
    isAtBottom = checkIfAtBottom();

    // If at bottom, hide arrow immediately and don't allow it to show
    if (isAtBottom) {
      // Immediately stop the animation loop
      restartTimeOffset = 0.0;
      hasStartedRestartAnimation = false;

      // Fade out arrow if visible
      if (uniforms.uArrowAnimationVisible.value > 0.01) {
        if (arrowVisibilityTween && arrowVisibilityTween.isActive()) {
          arrowVisibilityTween.kill();
        }
        arrowVisibilityTween = gsap.to(uniforms.uArrowAnimationVisible, {
          value: 0.0,
          duration: 0.5,
          ease: "power1.out",
        });
      }

      // Stop restart animation
      if (arrowRestartTween && arrowRestartTween.isActive()) {
        arrowRestartTween.kill();
      }
      uniforms.uArrowAnimationRestart.value = 0.0;
    }
    // If 5 seconds have passed since page load and no scroll in last 5 seconds,
    // and we're NOT at the bottom, show and start restart animation
    else if (timeSinceLoad >= 5.0 && timeSinceScroll >= 5.0 && !isScrolling) {
      // Fade in visibility if not already visible
      if (uniforms.uArrowAnimationVisible.value < 0.99) {
        if (arrowVisibilityTween === null || !arrowVisibilityTween.isActive()) {
          arrowVisibilityTween = gsap.to(uniforms.uArrowAnimationVisible, {
            value: 1.0,
            duration: 0.8,
            ease: "power2.out",
            onComplete: () => {
              // After visibility is fully visible, start the restart animation from top
              if (!hasStartedRestartAnimation) {
                // Capture current offset position for smooth transition
                const currentOffset = (timeSec * 0.6) % 1.0;
                uniforms.uArrowRestartStartOffset.value = currentOffset;
                // Initialize restartTimeOffset to current time so restartOffset starts at 0.0
                restartTimeOffset = timeSec;
                uniforms.uArrowRestartTime.value = 0.0; // Start at 0.0
                // Mark as started immediately
                uniforms.uArrowRestartHasStarted.value = 1.0;
                // Start restart at 1.0 immediately (no transition animation)
                // This makes restartOffset start updating right away from 0.0
                uniforms.uArrowAnimationRestart.value = 1.0;
                // Set flag to prevent resetting every frame
                hasStartedRestartAnimation = true;
              }
            },
          });
        }
      } else if (uniforms.uArrowAnimationVisible.value >= 0.99) {
        // If already visible, start restart animation immediately if not already started
        if (!hasStartedRestartAnimation) {
          // Capture current offset position (not used but kept for consistency)
          const currentOffset = (timeSec * 0.6) % 1.0;
          uniforms.uArrowRestartStartOffset.value = currentOffset;
          restartTimeOffset = timeSec;
          uniforms.uArrowRestartTime.value = 0.0;
          // Mark as started immediately
          uniforms.uArrowRestartHasStarted.value = 1.0;
          // Start restart at 1.0 immediately (no transition animation)
          uniforms.uArrowAnimationRestart.value = 1.0;
          // Set flag to prevent resetting every frame
          hasStartedRestartAnimation = true;
        }
      }
    }
  }

  // Handle scroll events - hide arrow animation when user scrolls
  function handleScroll() {
    lastScrollTime = Date.now();
    isScrolling = true;

    // Check if we're at the bottom
    isAtBottom = checkIfAtBottom();

    // Immediately stop the animation loop to prevent update() from resetting visibility
    restartTimeOffset = 0.0;
    hasStartedRestartAnimation = false;

    // If at bottom, hide arrow immediately (don't wait for fade)
    if (isAtBottom) {
      if (arrowVisibilityTween && arrowVisibilityTween.isActive()) {
        arrowVisibilityTween.kill();
      }
      uniforms.uArrowAnimationVisible.value = 0.0;

      if (arrowRestartTween && arrowRestartTween.isActive()) {
        arrowRestartTween.kill();
      }
      uniforms.uArrowAnimationRestart.value = 0.0;
      uniforms.uArrowRestartStartOffset.value = 0.0;
      uniforms.uArrowRestartHasStarted.value = 0.0;
    } else {
      // Fade out visibility smoothly when user scrolls (do this first for smooth transition)
      if (arrowVisibilityTween && arrowVisibilityTween.isActive()) {
        arrowVisibilityTween.kill();
      }
      arrowVisibilityTween = gsap.to(uniforms.uArrowAnimationVisible, {
        value: 0.0,
        duration: 1.2,
        ease: "power1.out",
      });

      // Stop restart animation smoothly after a slight delay to allow visibility to fade
      if (arrowRestartTween && arrowRestartTween.isActive()) {
        arrowRestartTween.kill();
      }
      arrowRestartTween = gsap.to(uniforms.uArrowAnimationRestart, {
        value: 0.0,
        duration: 1.0,
        ease: "power1.out",
        onComplete: () => {
          // Reset restart time offset, start offset, has started flag, and animation flag when animation stops
          uniforms.uArrowRestartStartOffset.value = 0.0;
          uniforms.uArrowRestartHasStarted.value = 0.0;
        },
      });
    }

    // Reset scrolling flag after a delay
    setTimeout(() => {
      isScrolling = false;
    }, 1500); // Longer delay to ensure fade-out completes
  }

  // Add scroll listener
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", handleScroll, { passive: true });
    window.addEventListener("touchmove", handleScroll, { passive: true });
  }

  function dispose() {
    // Clean up edge lines
    leftObstacleLines.forEach((line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    leftObstacleLines.length = 0;

    rightObstacleLines.forEach((line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    rightObstacleLines.length = 0;

    edgeLineMaterial.dispose();
    // Clean up scroll listeners
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleScroll);
      window.removeEventListener("touchmove", handleScroll);
    }
    // Kill any active tweens
    if (arrowRestartTween) {
      arrowRestartTween.kill();
    }
    if (arrowVisibilityTween) {
      arrowVisibilityTween.kill();
    }
    // Clean up obstacle meshes
    if (leftObstacleMesh) {
      parent.remove(leftObstacleMesh);
      leftObstacleMesh.geometry.dispose();
      (leftObstacleMesh.material as THREE.Material).dispose();
    }
    if (rightObstacleMesh) {
      parent.remove(rightObstacleMesh);
      rightObstacleMesh.geometry.dispose();
      (rightObstacleMesh.material as THREE.Material).dispose();
    }
    obstacleMaterial.dispose();

    // Clean up edge lines
    leftObstacleLines.forEach((line: THREE.Line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    leftObstacleLines.length = 0;

    rightObstacleLines.forEach((line: THREE.Line) => {
      if (line.parent) {
        line.parent.remove(line);
      }
      scene.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    rightObstacleLines.length = 0;

    edgeLineMaterial.dispose();

    parent.remove(plane);
    plane.geometry.dispose();
    mat.dispose();
  }

  // initial resize
  resize();

  // Method to update side text positions for obstacle effect
  function updateSideTextPositions(
    leftPos: THREE.Vector2 | null,
    rightPos: THREE.Vector2 | null,
    leftSize: THREE.Vector2 | null = null,
    rightSize: THREE.Vector2 | null = null
  ) {
    if (leftPos && leftSize) {
      uniforms.uSideTextLeftPos.value.copy(leftPos);
      uniforms.uSideTextLeftSize.value.copy(leftSize);
    } else {
      // Hide left text obstacle
      uniforms.uSideTextLeftPos.value.set(-1.0, 0.5);
      uniforms.uSideTextLeftSize.value.set(0.0, 0.0);
    }

    if (rightPos && rightSize) {
      uniforms.uSideTextRightPos.value.copy(rightPos);
      uniforms.uSideTextRightSize.value.copy(rightSize);
    } else {
      // Hide right text obstacle
      uniforms.uSideTextRightPos.value.set(-1.0, 0.5);
      uniforms.uSideTextRightSize.value.set(0.0, 0.0);
    }

    // Update obstacle meshes when positions change
    updateObstacleMeshes();
  }

  // Method to update edge angles immediately (no animation delay)
  function updateEdgeAngles(
    leftTopAngle?: number,
    leftBottomAngle?: number,
    rightTopAngle?: number,
    rightBottomAngle?: number
  ) {
    if (leftTopAngle !== undefined) {
      uniforms.uSideTextLeftTopAngle.value = leftTopAngle;
    }
    if (leftBottomAngle !== undefined) {
      uniforms.uSideTextLeftBottomAngle.value = leftBottomAngle;
    }
    if (rightTopAngle !== undefined) {
      uniforms.uSideTextRightTopAngle.value = rightTopAngle;
    }
    if (rightBottomAngle !== undefined) {
      uniforms.uSideTextRightBottomAngle.value = rightBottomAngle;
    }

    // Update obstacle meshes when angles change
    updateObstacleMeshes();
  }

  // Method to update obstacle rotation immediately (no animation delay)
  function updateObstacleRotation(
    leftRotation?: number,
    rightRotation?: number
  ) {
    if (leftRotation !== undefined) {
      uniforms.uSideTextLeftRotation.value = leftRotation;
    }
    if (rightRotation !== undefined) {
      uniforms.uSideTextRightRotation.value = rightRotation;
    }

    // Update obstacle meshes when rotation changes
    updateObstacleMeshes();
  }

  return {
    mesh: plane,
    update,
    resize,
    dispose,
    material: mat,
    updateSideTextPositions,
    updateEdgeAngles,
    updateObstacleRotation,
    uniforms, // Expose uniforms for direct access if needed
  };
}
