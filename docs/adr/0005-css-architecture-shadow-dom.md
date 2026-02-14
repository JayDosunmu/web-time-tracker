# ADR-0005: CSS Architecture for Shadow DOM and Regular Content

**Date:** 2026-02-14

**Status:** Accepted

## Context

This extension renders UI in two distinct contexts:

1. **Shadow DOM** (content scripts) - The TimeDisplayPill and its child components run inside a closed Shadow DOM to isolate styles from host page interference. Global stylesheets cannot penetrate the Shadow DOM boundary.

2. **Regular document** (popup, options) - Standard HTML documents where global CSS works normally.

Shared components (e.g., `TimelineChart`) need to work in both contexts. Initially, some shared components used inline styles to avoid dealing with CSS loading complexities, but this approach:
- Prevents use of CSS features like media queries, pseudo-classes, and CSS variables
- Makes styles harder to override from parent contexts
- Creates inconsistency with other components that use CSS files

## Decision

**CSS files will always be preferred over inline styles.** Components shall define their styles in separate `.css` files, which will be:

1. **For Shadow DOM contexts**: Imported as inline strings using Vite's `?inline` suffix and injected directly into the shadow root.

2. **For regular document contexts**: Imported normally or included via standard CSS bundling.

### Implementation Pattern

**Component CSS file** (`Component.css`):
```css
.component-class {
  /* styles */
}
```

**Shadow DOM consumer** (e.g., `TimeDisplayPill.tsx`):
```typescript
import componentStyles from "@/shared/components/Component.css?inline";

// In shadow root setup:
style.textContent = pillStyles + "\n" + componentStyles;
```

**Regular document consumer**:
```typescript
import "@/shared/components/Component.css";
// Or include in entry point's CSS bundle
```

## Consequences

### Positive

- Full CSS feature set available (media queries, container queries, pseudo-classes, variables)
- Consistent styling approach across all components
- Styles can be overridden via CSS specificity when needed
- Clear separation of concerns (structure vs presentation)
- Easier to maintain responsive designs

### Negative

- Shadow DOM consumers must explicitly import and inject CSS strings
- Adding a new shared component requires updating CSS injection in all Shadow DOM consumers
- Slightly more boilerplate for Shadow DOM contexts

### Neutral

- CSS files live alongside their component files (co-location pattern)
- The `?inline` import suffix is Vite/WXT-specific but well-documented

## Implementation

### Affected Files

- Shared components: Create `.css` files alongside `.tsx` files
- `TimeDisplayPill.tsx`: Import and inject CSS strings for all used shared components
- Future Shadow DOM components: Follow the same injection pattern

### Example: TimelineChart

```
src/shared/components/
  TimelineChart.tsx      # Component logic
  TimelineChart.css      # Component styles
  index.ts               # Exports
```

Consumer in Shadow DOM:
```typescript
import timelineChartStyles from "@/shared/components/TimelineChart.css?inline";
// ... inject into shadow root
```

## References

- [MDN: Using Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [Vite: Importing CSS as String](https://vitejs.dev/guide/features.html#disabling-css-injection-into-the-page)
- [WXT: Content Script UI](https://wxt.dev/guide/content-script-ui.html)
