# Code Reduction Analysis for `useDoorSceneSetup.ts`

## Current State
- **File Size**: 3,392 lines
- **Main Issues**: Monolithic structure, complex manual calculations, repetitive code

## Logic Breakdown

### 1. Text Justification & Layout (Lines 774-1522) - ~750 lines
**Current Implementation:**
- Manual word spacing calculations
- Font size scaling for justification
- Line-by-line geometry creation
- Complex bounding box calculations
- Manual geometry merging

**Potential Libraries:**
- **troika-three-text** - High-quality text rendering with built-in word wrapping
  - Handles text layout automatically
  - Supports justification
  - Reduces ~500-600 lines
  - Install: `npm install troika-three-text`

- **three-mesh-ui** - Complete UI system for Three.js
  - Text components with layout management
  - Responsive sizing built-in
  - Could replace entire text system
  - Install: `npm install three-mesh-ui`

### 2. Responsive Sizing & Viewport Calculations (Lines 1524-2430) - ~900 lines
**Current Implementation:**
- Manual viewport calculations
- Complex breakpoint logic
- Frustum calculations
- Portal/column width calculations
- Text positioning calculations

**Potential Solutions:**
- **React Three Fiber** (`@react-three/fiber`) - Already using Three.js, but could use R3F hooks:
  - `useThree()` - Access camera, viewport, size
  - `useFrame()` - Animation loop
  - `useViewport()` - Responsive viewport calculations
  - Could reduce ~300-400 lines

- **Custom Hook Extraction**: Extract sizing logic into separate hooks:
  - `useResponsiveLayout()` - Handle viewport calculations
  - `usePortalSizing()` - Portal-specific sizing
  - `useTextSizing()` - Text positioning

### 3. Scroll Animations (Lines 2968-3294) - ~326 lines
**Current Implementation:**
- GSAP ScrollTrigger (already using)
- Complex progress calculations
- Multiple animation phases
- Manual state management

**Potential Improvements:**
- **@react-three/drei** - `useScrollControls()` hook
  - Simplified scroll-based animations
  - Could reduce ~100-150 lines

- **Extract to separate file**: `useScrollAnimations.ts`
  - Move all scroll logic out
  - Cleaner separation of concerns

### 4. Text Wrapping (Lines 716-772) - ~56 lines
**Current Implementation:**
- Manual word wrapping
- Width calculations per word

**Potential Libraries:**
- **troika-three-text** handles this automatically
- Or use a simple utility library like `word-wrap` (npm)

### 5. Geometry Utilities (Throughout)
**Current Implementation:**
- Manual geometry merging
- Bounding box calculations
- Validation logic

**Potential Libraries:**
- **three-bvh-csg** - For complex geometry operations
- **three/examples/jsm/utils/BufferGeometryUtils** - Already in Three.js!
  - `mergeGeometries()` - Replace manual merging
  - Could reduce ~100 lines

## Recommended Refactoring Strategy

### Phase 1: Extract Utilities (Immediate - ~500 lines reduction)
1. **Create `utils/textJustification.ts`**
   - Move `createJustifiedTextGeometry()` 
   - Move `wrapTextToFitWidth()`
   - Use `BufferGeometryUtils.mergeGeometries()` instead of manual merging

2. **Create `utils/viewportCalculations.ts`**
   - Extract viewport/frustum calculations
   - Extract responsive breakpoint logic

3. **Create `hooks/useResponsiveLayout.ts`**
   - Extract sizing logic
   - Return calculated values

### Phase 2: Adopt Libraries (Medium-term - ~800-1000 lines reduction)
1. **Replace Text System with troika-three-text**
   ```typescript
   import { Text } from 'troika-three-text'
   // Much simpler text rendering with built-in justification
   ```
   - Reduces text justification code significantly
   - Better performance
   - Built-in word wrapping

2. **Use React Three Fiber Hooks**
   ```typescript
   import { useThree, useFrame } from '@react-three/fiber'
   // Simplified viewport and animation access
   ```

3. **Use BufferGeometryUtils**
   ```typescript
   import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils'
   // Replace manual geometry merging
   ```

### Phase 3: Architecture Improvements (Long-term - Better maintainability)
1. **Split into multiple hooks:**
   - `usePortalSetup.ts` - Portal creation and management
   - `useTextSetup.ts` - Text rendering and positioning
   - `useScrollAnimations.ts` - Scroll-based animations
   - `useResponsiveLayout.ts` - Viewport calculations

2. **Create configuration objects:**
   - Extract magic numbers to constants
   - Create type-safe config objects

## Specific Library Recommendations

### High Priority (Biggest Impact)

1. **troika-three-text** ⭐⭐⭐⭐⭐ ✅ **ALREADY INSTALLED!**
   - **Impact**: Reduces ~500-600 lines
   - **Status**: Already in package.json (v0.52.4)
   - **Usage**: Replace manual text geometry creation
   - **Pros**: Built-in word wrap, justification, better performance
   - **Cons**: Learning curve, might need to adjust shader integration
   - **Action**: Can start using immediately!

2. **@react-three/fiber** ⭐⭐⭐⭐
   - **Impact**: Reduces ~300-400 lines
   - **Install**: `npm install @react-three/fiber`
   - **Usage**: Replace manual Three.js setup with declarative components
   - **Pros**: React-like API, better state management, hooks
   - **Cons**: Requires refactoring to component-based approach

3. **three/examples/jsm/utils/BufferGeometryUtils** ⭐⭐⭐⭐
   - **Impact**: Reduces ~100 lines
   - **Install**: Already in Three.js (no install needed)
   - **Usage**: Replace manual geometry merging (lines 1376-1505)
   - **Pros**: No new dependency, official Three.js utility
   - **Cons**: None

### Medium Priority

4. **@react-three/drei** ⭐⭐⭐
   - **Impact**: Reduces ~100-150 lines
   - **Install**: `npm install @react-three/drei`
   - **Usage**: Helper components and hooks for common patterns
   - **Pros**: Many utilities, well-maintained
   - **Cons**: Adds dependency

5. **three-mesh-ui** ⭐⭐⭐
   - **Impact**: Could replace entire UI system
   - **Install**: `npm install three-mesh-ui`
   - **Usage**: Complete UI system with text, layout, etc.
   - **Pros**: Very comprehensive
   - **Cons**: Might be overkill, learning curve

### Low Priority (Nice to Have)

6. **lodash-es** or **ramda**
   - **Impact**: Reduces ~50-100 lines
   - **Usage**: Utility functions for common operations
   - **Pros**: Well-tested utilities
   - **Cons**: Bundle size consideration

## Estimated Reduction

### Conservative Estimate (Just extraction + BufferGeometryUtils)
- **Current**: 3,392 lines
- **After Phase 1**: ~2,892 lines (-500 lines, ~15% reduction)

### Moderate Estimate (Extraction + troika-three-text)
- **After Phase 2**: ~1,892 lines (-1,500 lines, ~44% reduction)

### Optimistic Estimate (Full refactor to R3F + libraries)
- **After Phase 3**: ~1,200-1,500 lines (-1,900-2,200 lines, ~56-65% reduction)

## Implementation Priority

1. **Immediate (This Week)**
   - Extract `createJustifiedTextGeometry` to separate file
   - Use `BufferGeometryUtils.mergeGeometries()`
   - Extract viewport calculations to utility functions

2. **Short-term (This Month)**
   - Evaluate and integrate `troika-three-text`
   - Extract scroll animations to separate hook
   - Create responsive layout hook

3. **Long-term (Next Quarter)**
   - Consider migrating to React Three Fiber
   - Full component-based architecture
   - Type-safe configuration system

## Code Examples

### Before (Manual Geometry Merging - Lines 1376-1505)
```typescript
// 130 lines of manual merging code
const mergedGeometry = new THREE.BufferGeometry();
const positions: number[] = [];
// ... lots of manual array manipulation
```

### After (Using BufferGeometryUtils)
```typescript
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils'
const mergedGeometry = mergeGeometries(geometries);
// Done in 1 line!
```

### Before (Manual Text Justification - Lines 774-1522)
```typescript
// 750 lines of complex justification logic
function createJustifiedTextGeometry(...) {
  // Word spacing calculations
  // Font scaling
  // Manual geometry creation
  // ... hundreds of lines
}
```

### After (Using troika-three-text)
```typescript
import { Text } from 'troika-three-text'
<Text
  text={text}
  fontSize={size}
  maxWidth={maxWidth}
  textAlign="justify"
  // Built-in justification!
/>
```

## Quick Start: Immediate Wins (Can Do Today)

### 1. Use BufferGeometryUtils (Already Available in Three.js)
**Location**: Lines 1376-1505 (geometry merging)
**Time**: 30 minutes
**Savings**: ~130 lines

```typescript
// Replace manual merging with:
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils'

// Instead of 130 lines of manual merging:
const mergedGeometry = mergeGeometries(geometries);
```

### 2. Extract Text Justification to Separate File
**Location**: Lines 774-1522
**Time**: 1-2 hours
**Savings**: Better organization (same lines, but separated)

Create `src/utils/textJustification.ts` and move the function there.

### 3. Extract Viewport Calculations
**Location**: Lines 1524-2430 (updateSizing function)
**Time**: 2-3 hours
**Savings**: Better organization

Create `src/hooks/useResponsiveLayout.ts` and extract sizing logic.

## Notes

- Some custom logic (portal shaders, spiral effects) will likely remain
- The refactoring should be done incrementally to avoid breaking changes
- Test thoroughly after each phase
- Consider creating a migration guide for team members
- **troika-three-text is already installed** - consider evaluating it for future text rendering needs

