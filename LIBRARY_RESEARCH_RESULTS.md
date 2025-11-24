# Library Research Results for Code Simplification

## 📦 Currently Installed Packages

From `package.json`:
- ✅ **troika-three-text** (v0.52.4) - Already installed!
- ✅ **three** (v0.180.0) - Core library
- ✅ **gsap** (v3.13.0) - Animation library
- ✅ **@mapbox/mapbox-gl-rtl-text** (v0.3.0) - RTL text support

---

## 🎯 Recommended Libraries by Section

### 1. **Text Justification & Rendering** (670 lines → Potential 50% reduction)

#### ✅ **troika-three-text** (ALREADY INSTALLED)
**GitHub**: https://github.com/protectwise/troika/tree/master/packages/troika-three-text  
**Features**:
- Text justification support
- Word wrapping
- Line breaking
- Kerning and ligatures
- RTL text support
- Automatic fallback fonts
- SDF (Signed Distance Field) rendering

**⚠️ Limitation**: Uses SDF rendering, which is incompatible with custom shader materials that require BufferGeometry. However, it can still be used for simpler text rendering cases.

**Recommendation**: 
- Keep current TextGeometry approach for wavy text (needs custom shaders)
- Consider using troika-three-text for static text elements
- Use troika's layout engine for justification calculations (extract logic)

#### 🔄 **three-text-geometry** (NOT INSTALLED)
**GitHub**: https://github.com/gumob/three-text-geometry  
**npm**: `npm install three-text-geometry`  
**Features**:
- Extends `THREE.BufferGeometry` (compatible with custom shaders!)
- Word wrapping
- Text alignment
- Letter spacing
- Kerning
- Bitmap font rendering

**Advantages**:
- ✅ Compatible with custom shader materials
- ✅ Uses BufferGeometry (works with your wavy text shaders)
- ✅ Supports word wrapping and alignment
- ✅ More efficient than manual TextGeometry creation

**Recommendation**: **STRONGLY RECOMMENDED** - Can replace most of the text justification code while maintaining shader compatibility.

#### 🔄 **three-msdf-text-utils** (NOT INSTALLED)
**GitHub**: https://github.com/leochocolat/three-msdf-text-utils  
**npm**: `npm install three-msdf-text-utils`  
**Features**:
- MSDF (Multi-channel Signed Distance Field) rendering
- High-quality text rendering
- Geometry attributes for text

**Recommendation**: Consider if you need MSDF rendering quality, but may not help with justification logic.

---

### 2. **Viewport & Responsive Calculations** (912 lines → Potential 40% reduction)

#### 🔄 **React Three Fiber (R3F)** (NOT INSTALLED)
**GitHub**: https://github.com/pmndrs/react-three-fiber  
**npm**: `npm install react-three-fiber`  
**Features**:
- Declarative Three.js scene management
- `useThree()` hook provides viewport, camera, size
- `useFrame()` for animation loops
- Built-in responsive handling

**Hooks Available**:
- `useThree()` - Access to viewport, camera, size, gl
- `useFrame()` - Animation loop
- `useIntersect()` - Intersection detection
- `useScrollControls()` - Scroll-based animations

**Example**:
```typescript
import { useThree } from '@react-three/fiber'

function MyComponent() {
  const { viewport, size, camera } = useThree()
  // viewport.width, viewport.height automatically calculated
  // size.width, size.height in pixels
}
```

**Recommendation**: **CONSIDER** - Would require significant refactoring but could reduce viewport calculation code significantly.

#### 🔄 **@react-three/drei** (NOT INSTALLED)
**GitHub**: https://github.com/pmndrs/drei  
**npm**: `npm install @react-three/drei`  
**Features**:
- `Text3D` component for 3D text
- `useScrollControls()` hook for scroll animations
- `useHelper()` for debugging
- Various utilities

**Recommendation**: **CONSIDER** - If migrating to R3F, this provides many utilities.

#### 🔄 **frustum-intersects** (NOT INSTALLED)
**npm**: `npm install frustum-intersects`  
**Features**:
- Zero-dependency frustum intersection checks
- Extracted from Three.js
- Determines if camera frustum intersects with box/sphere

**Recommendation**: **MINOR IMPACT** - Only helps with intersection checks, not calculations.

---

### 3. **Scroll Animations** (317 lines → Potential 30% reduction)

#### ✅ **GSAP** (ALREADY INSTALLED)
**Current Usage**: ScrollTrigger with manual progress calculations

**Better Patterns Available**:
- Use GSAP Timeline for multi-phase animations
- Use `gsap.utils.mapRange()` for progress mapping
- Use `gsap.utils.clamp()` for value clamping
- Use `gsap.utils.interpolate()` for smooth transitions

**Recommendation**: **OPTIMIZE CURRENT USAGE** - No new library needed, just better GSAP patterns.

#### 🔄 **@react-three/drei useScrollControls** (NOT INSTALLED)
**Features**:
- Scroll-based animation hook
- Integrates with React Three Fiber

**Recommendation**: Only if migrating to R3F.

---

### 4. **Text Bounds & Projection** (108 lines → Potential 50% reduction)

#### ✅ **Three.js Built-in Utilities**
**Available**:
- `THREE.Frustum` - Already used
- `THREE.Raycaster` - Already used
- `object3D.project()` - Already used

**Recommendation**: **EXTRACT TO UTILITIES** - No new library needed, just extract repeated patterns.

#### 🔄 **@math.gl/culling** (NOT INSTALLED)
**npm**: `npm install @math.gl/culling`  
**Features**:
- Frustum culling primitives
- Bounding box intersection logic

**Recommendation**: **MINOR IMPACT** - Only if you need advanced culling.

---

### 5. **Pointer Events & Click Detection** (137 lines → Potential 20% reduction)

#### 🔄 **React Three Fiber useIntersect** (NOT INSTALLED)
**Features**:
- Built-in intersection detection
- Works with R3F components

**Recommendation**: Only if migrating to R3F.

#### ✅ **Three.js Raycaster** (ALREADY AVAILABLE)
**Current Usage**: Already using Raycaster

**Recommendation**: **OPTIMIZE CURRENT USAGE** - Extract to helper functions.

---

## 🚀 Implementation Priority

### **Priority 1: High Impact, Low Risk**

1. **Install `three-text-geometry`** ⭐⭐⭐⭐⭐
   - **Impact**: Can replace ~300-400 lines of text justification code
   - **Risk**: Low - Uses BufferGeometry (compatible with shaders)
   - **Effort**: Medium - Need to refactor text creation
   - **Install**: `npm install three-text-geometry`
   - **Search**: "three-text-geometry examples word wrapping"

2. **Extract Viewport Utilities** ⭐⭐⭐⭐
   - **Impact**: Can reduce ~200-300 lines
   - **Risk**: None - Just code organization
   - **Effort**: Low - Extract existing code to utilities
   - **Action**: Create `utils/viewportCalculations.ts`

3. **Optimize GSAP Usage** ⭐⭐⭐
   - **Impact**: Can reduce ~100 lines
   - **Risk**: None - Just better patterns
   - **Effort**: Low - Refactor existing GSAP code
   - **Action**: Use Timeline, mapRange, clamp utilities

### **Priority 2: High Impact, Higher Risk**

4. **Migrate to React Three Fiber** ⭐⭐⭐⭐
   - **Impact**: Can reduce ~500-700 lines
   - **Risk**: High - Major refactoring required
   - **Effort**: Very High - Complete rewrite needed
   - **Install**: `npm install react-three-fiber @react-three/drei`
   - **Recommendation**: Consider for future major refactor, not immediate

### **Priority 3: Medium Impact, Low Risk**

5. **Extract Text Bounds Utilities** ⭐⭐⭐
   - **Impact**: Can reduce ~50-80 lines
   - **Risk**: None
   - **Effort**: Low
   - **Action**: Create `utils/textBounds.ts`

6. **Extract Pointer Event Helpers** ⭐⭐
   - **Impact**: Can reduce ~30-50 lines
   - **Risk**: None
   - **Effort**: Low
   - **Action**: Extract to helper functions

---

## 📋 Detailed Library Information

### **three-text-geometry**

**Installation**:
```bash
npm install three-text-geometry
```

**Key Features**:
- ✅ Word wrapping
- ✅ Text alignment (left, center, right, justify)
- ✅ Letter spacing
- ✅ Line height
- ✅ Uses BufferGeometry (shader compatible!)
- ✅ Efficient rendering

**Example Usage**:
```typescript
import { TextGeometry } from 'three-text-geometry'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'

// Load font
const loader = new FontLoader()
const font = await loader.loadAsync('/path/to/font.json')

// Create text geometry with justification
const geometry = new TextGeometry('Your text here', {
  font: font,
  size: 0.5,
  depth: 0.02,
  wordWrap: true,
  wordWrapWidth: 10, // Max width
  align: 'justify', // Supports 'left', 'center', 'right', 'justify'
  letterSpacing: 0,
  lineHeight: 1.2
})
```

**Potential Replacement**:
- Lines 775-1444 (text justification) → Could reduce to ~200-300 lines
- Maintains BufferGeometry compatibility with custom shaders

---

### **React Three Fiber (R3F)**

**Installation**:
```bash
npm install react-three-fiber @react-three/drei
```

**Key Hooks**:
```typescript
import { useThree, useFrame } from '@react-three/fiber'

// Get viewport automatically
const { viewport, size, camera } = useThree()
// viewport.width, viewport.height in world units
// size.width, size.height in pixels

// Animation loop
useFrame((state, delta) => {
  // state.viewport, state.camera, state.size available
})
```

**Benefits**:
- Automatic viewport calculations
- Built-in responsive handling
- Declarative scene management
- Better React integration

**Drawbacks**:
- Requires major refactoring
- Different mental model
- May not work with existing imperative code

---

## 🎯 Recommended Action Plan

### **Phase 1: Quick Wins (This Week)**
1. ✅ Extract viewport utilities (already started)
2. ✅ Extract frustum calculations (already done)
3. ✅ Extract uniform sync (already done)
4. Install and test `three-text-geometry`
5. Optimize GSAP usage patterns

### **Phase 2: Medium Term (Next 2 Weeks)**
1. Replace text justification with `three-text-geometry`
2. Extract text bounds utilities
3. Extract pointer event helpers
4. Simplify scroll animation code

### **Phase 3: Long Term (Future Consideration)**
1. Evaluate React Three Fiber migration
2. Consider full R3F refactor if project grows

---

## 📊 Expected Impact Summary

| Library/Approach | Lines Saved | Risk | Effort | Priority |
|-----------------|-------------|------|--------|----------|
| **three-text-geometry** | 300-400 | Low | Medium | ⭐⭐⭐⭐⭐ |
| **Extract Viewport Utils** | 200-300 | None | Low | ⭐⭐⭐⭐ |
| **Optimize GSAP** | 100 | None | Low | ⭐⭐⭐ |
| **Extract Text Bounds** | 50-80 | None | Low | ⭐⭐⭐ |
| **Extract Pointer Helpers** | 30-50 | None | Low | ⭐⭐ |
| **React Three Fiber** | 500-700 | High | Very High | ⭐ (Future) |

**Total Potential Reduction**: 1,180-1,530 lines (36-46% reduction)

---

## 🔗 Useful Resources

1. **three-text-geometry**:
   - GitHub: https://github.com/gumob/three-text-geometry
   - Examples: Search "three-text-geometry examples"

2. **React Three Fiber**:
   - Docs: https://docs.pmnd.rs/react-three-fiber
   - Examples: https://docs.pmnd.rs/react-three-fiber/getting-started/examples

3. **GSAP Best Practices**:
   - Timeline: https://greensock.com/docs/v3/GSAP/gsap.timeline()
   - Utils: https://greensock.com/docs/v3/GSAP/gsap.utils

4. **troika-three-text** (Already Installed):
   - Docs: https://protectwise.github.io/troika/troika-three-text/
   - Features: Check justification and layout options

---

## ⚠️ Important Notes

1. **troika-three-text Limitation**: Uses SDF rendering, incompatible with custom shader materials. Keep for simple text, use TextGeometry for wavy text.

2. **three-text-geometry Advantage**: Uses BufferGeometry, fully compatible with custom shaders. This is the best option for your use case.

3. **React Three Fiber**: Would require significant refactoring. Consider for future major version, not immediate.

4. **Current Progress**: Already reduced 376 lines (11.3%). Continue with utility extraction before major library changes.

---

## ✅ Next Steps

1. **Test `three-text-geometry`** in a small section first
2. **Continue extracting utilities** (viewport, text bounds, etc.)
3. **Optimize GSAP patterns** in scroll animations
4. **Evaluate results** before committing to major changes

