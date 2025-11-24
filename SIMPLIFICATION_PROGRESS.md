# Code Simplification Progress

## ✅ Completed Simplifications

### 1. **Extracted Uniform Synchronization** (Saved ~30 lines)
**Before**: Duplicate code blocks for wavyTexts and columnTexts (56 lines)  
**After**: Single `syncSpiralUniforms()` helper function (26 lines)  
**Location**: Lines 2594-2650

### 2. **Extracted Frustum Edge Calculations** (Saved ~60 lines)
**Before**: Repeated frustum calculation 4 times (80+ lines total)  
**After**: `getFrustumEdgesAtDepth()` and `getOffScreenPositions()` helpers (20 lines)  
**Locations**: Lines 2850, 3055, 3125, 3223

### 3. **Extracted Viewport Dimensions** (Saved ~15 lines)
**Before**: Repeated viewport calculation pattern  
**After**: `getViewportDimensions()` helper function  
**Location**: Lines 1447-1496

### 4. **Used BufferGeometryUtils** (Saved ~50 lines)
**Before**: Manual geometry merging (130 lines)  
**After**: `mergeGeometries()` from Three.js (80 lines)  
**Location**: Lines 1362-1459

---

## 📊 Current Status

**Original File Size**: 3,318 lines  
**Current File Size**: 2,942 lines  
**Reduction So Far**: **376 lines (11.3%)**

---

## 🎯 Next Steps (High Impact)

### Priority 1: Extract Viewport Calculations Module (~300 lines)
**Search Terms**: "Three.js viewport utilities", "React Three Fiber useThree hook"  
**Action**: Create `utils/viewportCalculations.ts`
- Extract all frustum calculations
- Extract CSS to world space conversions
- Extract responsive breakpoint logic

### Priority 2: Simplify Text Justification (~200 lines)
**Search Terms**: "Text justification algorithm", "Word spacing justification"  
**Action**: 
- Remove font scaling logic (keep only spacing)
- Extract word width calculation with caching
- Simplify validation logic

### Priority 3: Extract Scroll Animations (~150 lines)
**Search Terms**: "GSAP ScrollTrigger timeline", "Multi-phase scroll animation"  
**Action**: Create `hooks/useScrollAnimations.ts`
- Extract animation phase calculations
- Extract off-screen position logic (already partially done)
- Simplify progress mapping

### Priority 4: Extract Text Bounds Calculation (~100 lines)
**Search Terms**: "Three.js bounding box screen projection"  
**Action**: Create `utils/textBounds.ts`
- Extract `calculateTextBounds()` function
- Reuse existing projection utilities

---

## 📋 Remaining Major Sections

1. **Text Justification** (Lines 775-1444) - ~670 lines
   - Can be simplified by removing font scaling
   - Extract word width calculation
   - Cache calculations

2. **Responsive Layout** (Lines 1445-2357) - ~912 lines  
   - Extract to `hooks/useResponsiveLayout.ts`
   - Create layout config objects
   - Simplify breakpoint logic

3. **Scroll Animations** (Lines 2889-3206) - ~317 lines
   - Extract to `hooks/useScrollAnimations.ts`
   - Use GSAP timeline better
   - Simplify progress calculations

4. **Text Bounds** (Lines 2393-2501) - ~108 lines
   - Extract to utility function
   - Reuse projection utilities

---

## 🔍 Search Strategy for Each Section

See `SEARCHABLE_SECTIONS.md` for detailed search terms for each major section.

---

## 💡 Quick Wins Still Available

1. **Extract word width calculation** (used 3+ times per word in justification)
2. **Extract geometry validation** (repeated 10+ times)
3. **Extract text positioning logic** (duplicated for left/right texts)
4. **Simplify breakpoint detection** (can use a config object)
5. **Extract animation progress calculations** (repeated patterns)

---

## 📈 Target Reduction

**Conservative Goal**: 2,200 lines (34% reduction)  
**Moderate Goal**: 1,800 lines (46% reduction)  
**Aggressive Goal**: 1,500 lines (55% reduction)

**Current Progress**: 11.3% reduction achieved ✅

