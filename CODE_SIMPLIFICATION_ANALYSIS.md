# Code Simplification Analysis for `useDoorSceneSetup.ts`

**Current File Size**: 3,318 lines  
**Target**: Reduce by 40-60% through extraction, simplification, and library usage

---

## 📊 Major Logic Sections Identified

### 1. **Text Justification & Geometry Creation** (Lines 775-1444)
**Size**: ~670 lines  
**Title for Search**: "Three.js TextGeometry justification word spacing font scaling"  
**Current Logic**:
- Manual word-by-word geometry creation
- Complex spacing calculations (MAX_SPACE_MULTIPLIER)
- Font size scaling for justification
- First line font size override
- Line-by-line justification with edge cases
- Manual geometry merging (now using BufferGeometryUtils)

**Redundancies Found**:
- Multiple validation checks for same conditions (font, baseSize, NaN checks)
- Duplicate word width calculation logic (calculated 3+ times per word)
- Repeated geometry creation/disposal pattern
- Similar validation logic for left/right text

**Simplification Opportunities**:
- Extract word width calculation to helper function
- Extract geometry validation to helper function
- Simplify justification algorithm (remove font scaling, keep only spacing)
- Use utility function for repeated patterns

**Libraries to Research**:
- "Three.js text layout library"
- "TextGeometry word wrapping Three.js"
- "CSS text-align justify algorithm JavaScript"

---

### 2. **Responsive Viewport & Layout Calculations** (Lines 1445-2357)
**Size**: ~912 lines  
**Title for Search**: "Three.js responsive viewport frustum calculations CSS to world space conversion"  
**Current Logic**:
- Viewport width/height calculations
- Frustum calculations (camera FOV, aspect ratio)
- CSS to world space conversion
- Portal sizing (mobile/portrait/landscape breakpoints)
- Column width calculations
- Text positioning in world space
- Responsive text sizing

**Redundancies Found**:
- Frustum calculation repeated 3+ times (lines 1478, 1937, 2863, 3136, 3234)
- Viewport width/height calculation repeated 5+ times
- CSS to world space conversion duplicated
- Similar breakpoint logic for mobile/portrait/landscape
- Duplicate text positioning calculations

**Simplification Opportunities**:
- Extract frustum calculation to helper: `calculateFrustumAtDepth(z: number)`
- Extract viewport getter: `getViewportDimensions()`
- Extract CSS to world converter: `cssToWorldSpace(cssValue: number, depth: number)`
- Create responsive layout config object
- Use CSS custom properties or media queries where possible

**Libraries to Research**:
- "Three.js viewport utilities"
- "React Three Fiber useThree hook viewport"
- "CSS to 3D world space conversion library"
- "Responsive layout breakpoint utilities"

---

### 3. **Text Wrapping Logic** (Lines 717-773)
**Size**: ~56 lines  
**Title for Search**: "Text word wrapping algorithm max width Three.js TextGeometry"  
**Current Logic**:
- Manual word-by-word width testing
- Creates temporary TextGeometry for each test
- Preserves line breaks

**Redundancies Found**:
- Creates/disposes TextGeometry for every word test
- Could cache word widths

**Simplification Opportunities**:
- Use troika-three-text's layout engine (if compatible)
- Cache word widths to avoid repeated geometry creation
- Use simpler approximation for word width (font size * character count * ratio)

**Libraries to Research**:
- "JavaScript text wrapping library"
- "Word wrap algorithm npm"
- "Text measurement without canvas"

---

### 4. **Scroll Animation & GSAP ScrollTrigger** (Lines 2889-3206)
**Size**: ~317 lines  
**Title for Search**: "GSAP ScrollTrigger multi-phase animation timeline"  
**Current Logic**:
- Multi-phase scroll animation (scale up, rotate, scale down)
- Side text slide-in animation
- Portal scaling animation
- Spiral fade animation
- Complex progress calculations

**Redundancies Found**:
- Similar progress calculation patterns
- Duplicate off-screen position calculations (lines 2860, 3053, 3136, 3234)
- Repeated frustum edge calculations

**Simplification Opportunities**:
- Extract animation phases to separate functions
- Use GSAP timeline instead of manual progress calculations
- Extract off-screen position calculation to helper
- Create animation config object

**Libraries to Research**:
- "GSAP ScrollTrigger timeline best practices"
- "React Three Fiber useFrame animation hooks"
- "Scroll-based animation state machine"

---

### 5. **Text Bounds Calculation for Spiral Obstacle** (Lines 2393-2501)
**Size**: ~108 lines  
**Title for Search**: "Three.js mesh bounding box to screen UV coordinates projection"  
**Current Logic**:
- Calculates text mesh bounding box
- Projects corners to screen space
- Converts to UV coordinates
- Handles coordinate system flipping

**Redundancies Found**:
- Similar projection logic exists in `projectObjectToScreenUv`
- Could reuse existing projection utilities

**Simplification Opportunities**:
- Extract to helper function: `getMeshScreenBounds(mesh, camera)`
- Reuse `projectObjectToScreenUv` if possible
- Use Three.js built-in utilities

**Libraries to Research**:
- "Three.js screen space projection utilities"
- "Bounding box to screen coordinates Three.js"
- "Object3D world to screen conversion"

---

### 6. **Uniform Synchronization** (Lines 2594-2650)
**Size**: ~56 lines  
**Title for Search**: "Three.js shader uniform synchronization pattern"  
**Current Logic**:
- Syncs spiral uniforms to wavy text materials
- Syncs spiral uniforms to column text materials
- Manual uniform copying

**Redundancies Found**:
- Identical sync logic for wavyTexts and columnTexts (duplicate code)
- Manual uniform property access

**Simplification Opportunities**:
- Extract to helper: `syncUniforms(source, targets, uniformNames[])`
- Use a uniform manager/registry pattern
- Create reusable sync function

**Libraries to Research**:
- "Three.js uniform management library"
- "Shader uniform synchronization utilities"

---

### 7. **Pointer Event Handling** (Lines 577-714)
**Size**: ~137 lines  
**Title for Search**: "Three.js Raycaster pointer click detection bounding box"  
**Current Logic**:
- Pointer move handler (cursor change)
- Pointer down handler (click detection)
- Raycasting for portal clicks
- Bounding box calculation for text clicks
- Screen space coordinate conversion

**Redundancies Found**:
- `getPointerFromEvent` duplicates pointer calculation
- Similar bounding box projection logic

**Simplification Opportunities**:
- Use Three.js event system if available
- Extract click detection to helper
- Use intersection helpers

**Libraries to Research**:
- "Three.js interaction manager"
- "React Three Fiber useIntersect hook"
- "Pointer events Three.js utilities"

---

### 8. **Font Loading & Text Mesh Creation** (Lines 2656-2799)
**Size**: ~143 lines  
**Title for Search**: "Three.js FontLoader TextGeometry async loading"  
**Current Logic**:
- English font loading
- Farsi font loading with RTL plugin
- Text geometry creation
- Perspective distortion application
- Material creation

**Redundancies Found**:
- Similar loading pattern for English and Farsi
- Could be abstracted

**Simplification Opportunities**:
- Extract font loading to helper: `loadFont(path): Promise<Font>`
- Extract text mesh creation to helper
- Use async/await consistently

**Libraries to Research**:
- "Three.js font loading utilities"
- "Text mesh factory pattern Three.js"

---

## 🔍 Specific Redundancies to Remove

### 1. **Frustum Calculation Duplication** (5+ instances)
**Locations**: Lines 1478, 1937, 2863, 3136, 3234, 3053  
**Solution**: Extract to `calculateFrustumAtDepth(z: number)`

### 2. **Viewport Dimension Duplication** (10+ instances)
**Locations**: Throughout updateSizing and scroll handlers  
**Solution**: Extract to `getViewportDimensions()`

### 3. **Off-Screen Position Calculation** (4+ instances)
**Locations**: Lines 2860, 3053, 3136, 3234  
**Solution**: Extract to `calculateOffScreenPosition(side: 'left' | 'right', depth: number)`

### 4. **Uniform Sync Duplication** (2 identical blocks)
**Locations**: Lines 2594-2618 (wavyTexts) and 2620-2650 (columnTexts)  
**Solution**: Extract to `syncSpiralUniforms(textMeshes, spiralUniforms)`

### 5. **Text Validation Duplication** (10+ instances)
**Locations**: Throughout createJustifiedTextGeometry  
**Solution**: Extract validation helpers

### 6. **Word Width Calculation Duplication** (3+ times per word)
**Locations**: Lines 960-1023, 1067-1094, 1211-1270  
**Solution**: Extract to `calculateWordWidth(word, font, size): number` with caching

---

## 📦 Recommended Extraction Structure

### Create These Utility Files:

1. **`utils/viewportCalculations.ts`** (~150 lines saved)
   - `getViewportDimensions()`
   - `calculateFrustumAtDepth(camera, depth)`
   - `cssToWorldSpace(cssValue, viewport, depth)`
   - `worldToCssSpace(worldValue, viewport, depth)`

2. **`utils/textJustification.ts`** (~200 lines saved)
   - `createJustifiedTextGeometry()` - simplified version
   - `calculateWordWidth()` - with caching
   - `validateTextGeometry()`
   - `wrapTextToFitWidth()` - optimized

3. **`utils/textBounds.ts`** (~100 lines saved)
   - `getMeshScreenBounds(mesh, camera)`
   - `calculateOffScreenPosition(side, depth, camera)`
   - `projectBoundingBoxToScreen(bbox, mesh, camera)`

4. **`utils/uniformSync.ts`** (~50 lines saved)
   - `syncSpiralUniforms(textMeshes, spiralUniforms)`
   - `updateUniformValue(uniform, value)`

5. **`hooks/useResponsiveLayout.ts`** (~300 lines saved)
   - Extract all responsive sizing logic
   - Portal/column width calculations
   - Breakpoint detection

6. **`hooks/useScrollAnimations.ts`** (~200 lines saved)
   - Extract scroll trigger setup
   - Animation phase calculations
   - Progress mapping

---

## 🎯 Quick Wins (Can Do Immediately)

### 1. Extract Frustum Calculation (Saves ~50 lines)
```typescript
// utils/viewportCalculations.ts
export function calculateFrustumAtDepth(
  camera: THREE.PerspectiveCamera,
  depth: number
): { width: number; height: number } {
  const distance = Math.abs(camera.position.z - depth);
  const vFov = (camera.fov * Math.PI) / 180;
  const height = 2 * distance * Math.tan(vFov / 2);
  const width = height * camera.aspect;
  return { width, height };
}
```

### 2. Extract Uniform Sync (Saves ~30 lines)
```typescript
// utils/uniformSync.ts
export function syncSpiralUniforms(
  textMeshes: THREE.Mesh[],
  spiralUniforms: any
) {
  textMeshes.forEach((mesh) => {
    if (mesh.material instanceof THREE.ShaderMaterial) {
      const uniforms = mesh.material.uniforms;
      if (uniforms.uTime) uniforms.uTime.value = spiralUniforms.uTime.value;
      // ... sync other uniforms
    }
  });
}
```

### 3. Extract Viewport Dimensions (Saves ~20 lines)
```typescript
// utils/viewportCalculations.ts
export function getViewportDimensions(mount: HTMLElement) {
  return {
    width: Math.max(1, window.innerWidth || mount.clientWidth || 0),
    height: Math.max(1, window.innerHeight || mount.clientHeight || 0),
  };
}
```

### 4. Remove Duplicate Off-Screen Calculation (Saves ~40 lines)
Extract to single function used 4 times.

---

## 🔬 Search Terms for Each Major Section

### For Text Justification:
- "CSS text-align justify algorithm implementation"
- "Word spacing justification JavaScript"
- "Text layout engine word wrapping"

### For Viewport Calculations:
- "Three.js camera frustum calculations"
- "CSS pixels to Three.js world units"
- "Responsive 3D scene viewport"

### For Scroll Animations:
- "GSAP ScrollTrigger multi-phase animation"
- "Scroll progress state machine"
- "Timeline-based scroll animations"

### For Text Bounds:
- "Three.js object3D to screen coordinates"
- "Bounding box screen projection"
- "World space to screen UV conversion"

### For Pointer Events:
- "Three.js Raycaster click detection"
- "Bounding box intersection test"
- "Screen to world ray casting"

---

## 📈 Estimated Reduction

| Section | Current | After Extraction | Savings |
|---------|---------|------------------|---------|
| Text Justification | 670 | 400 | -270 |
| Viewport Calculations | 912 | 600 | -312 |
| Scroll Animations | 317 | 200 | -117 |
| Text Bounds | 108 | 50 | -58 |
| Uniform Sync | 56 | 20 | -36 |
| Pointer Events | 137 | 100 | -37 |
| Font Loading | 143 | 100 | -43 |
| **Total** | **2,343** | **1,470** | **-873** |

**Estimated Final Size**: ~2,445 lines (26% reduction)  
**With Aggressive Simplification**: ~1,800 lines (46% reduction)

---

## 🚀 Implementation Priority

1. **High Priority** (Biggest Impact):
   - Extract viewport calculations (~312 lines)
   - Extract text justification helpers (~200 lines)
   - Remove uniform sync duplication (~30 lines)

2. **Medium Priority**:
   - Extract scroll animations (~117 lines)
   - Extract text bounds (~58 lines)
   - Extract pointer event helpers (~37 lines)

3. **Low Priority** (Nice to Have):
   - Simplify justification algorithm further
   - Optimize font loading
   - Add caching for calculations

---

## ⚠️ Important Notes

- **troika-three-text limitation**: Uses SDF rendering, incompatible with BufferGeometry needed for custom shaders
- **Custom shaders required**: Wavy text effects need custom materials, so we must keep TextGeometry approach
- **Test after each extraction**: Ensure functionality remains identical
- **Incremental approach**: Extract one section at a time, test, then continue

---

## 🔗 Library Research Links

For each section, search:
1. npm packages for the functionality
2. Three.js examples/utilities
3. React Three Fiber hooks
4. GSAP plugins/utilities
5. TypeScript utility libraries

