# Quick Action Items from Library Research

## 🎯 Top 3 Recommendations (Do First)

### 1. **Install `three-text-geometry`** ⭐⭐⭐⭐⭐
**Why**: Can replace 300-400 lines of text justification code while maintaining shader compatibility

**Command**:
```bash
npm install three-text-geometry
```

**What it does**:
- Word wrapping ✅
- Text justification ✅
- Uses BufferGeometry (compatible with your custom shaders!) ✅
- Text alignment options ✅

**Search for examples**: "three-text-geometry word wrapping justify example"

**Impact**: ~300-400 lines reduction

---

### 2. **Extract Viewport Utilities** ⭐⭐⭐⭐
**Why**: Already started, continue extracting repeated calculations

**Action**: Create `utils/viewportCalculations.ts` with:
- `getViewportDimensions()`
- `calculateFrustumAtDepth()`
- `cssToWorldSpace()`

**Impact**: ~200-300 lines reduction

---

### 3. **Optimize GSAP Usage** ⭐⭐⭐
**Why**: Better patterns can reduce scroll animation code

**Actions**:
- Use `gsap.timeline()` for multi-phase animations
- Use `gsap.utils.mapRange()` for progress mapping
- Use `gsap.utils.clamp()` for value clamping

**Search**: "GSAP ScrollTrigger timeline multi-phase animation"

**Impact**: ~100 lines reduction

---

## 📦 Libraries to Research Further

### **three-text-geometry** (HIGHEST PRIORITY)
- **GitHub**: https://github.com/gumob/three-text-geometry
- **Search**: "three-text-geometry npm examples"
- **Key Feature**: BufferGeometry compatible (works with your shaders!)

### **React Three Fiber** (FUTURE CONSIDERATION)
- **GitHub**: https://github.com/pmndrs/react-three-fiber
- **Note**: Would require major refactoring, consider for future
- **Search**: "React Three Fiber useThree viewport hook"

---

## 🔍 Search Terms for Each Section

### Text Justification
- "three-text-geometry word wrapping justify"
- "three-text-geometry text alignment example"
- "TextGeometry justification Three.js"

### Viewport Calculations
- "React Three Fiber useThree viewport"
- "Three.js camera frustum utilities"
- "CSS to world space Three.js"

### Scroll Animations
- "GSAP ScrollTrigger timeline best practices"
- "GSAP multi-phase scroll animation"
- "GSAP utils mapRange clamp"

### Text Bounds
- "Three.js bounding box screen projection"
- "Object3D to screen coordinates Three.js"

---

## ✅ Already Done

- ✅ Extracted uniform sync (saved ~30 lines)
- ✅ Extracted frustum calculations (saved ~60 lines)
- ✅ Extracted viewport dimensions (saved ~15 lines)
- ✅ Used BufferGeometryUtils (saved ~50 lines)

**Total saved so far**: 376 lines (11.3%)

---

## 📈 Expected Total Reduction

**Current**: 2,942 lines  
**After Priority 1-3**: ~2,200 lines (25% total reduction)  
**After all optimizations**: ~1,800 lines (46% total reduction)

---

## 🚀 Start Here

1. **Install three-text-geometry**: `npm install three-text-geometry`
2. **Read the docs**: Check GitHub for examples
3. **Test in small section**: Try replacing one text justification function
4. **Continue utility extraction**: Keep extracting repeated patterns

