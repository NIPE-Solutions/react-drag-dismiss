# Changelog

## 0.1.0-alpha.1 — 2026-09-06

- Preserve continuous offset and progress across React renders and preserve consumer transforms with independent CSS translation.
- Add velocity-aware bounded settling, deterministic gesture-start snapshots, and interruptible snap-back continuity.
- Add optional `onDismissComplete` after mounted departure while keeping `onDismiss` as immediate semantic commitment.
- Scope global blur handling to active pointer sessions and keep 1,000 idle instances free of global listeners, animation frames, and observers.
- Reject empty or mixed-axis directions and invalid thresholds with precise errors.
- Protect text-editing controls for mouse, touch, and pen, and add `data-drag-dismiss-ignore` for custom interaction surfaces.
- Expand lifecycle, integration, troubleshooting, performance, and real-device documentation.

## 0.1.0-alpha.0

- Initial drag-to-dismiss primitive with logical directions, intent arbitration, recent velocity, resistance, interruptible settling, reduced motion, SSR-safe packaging, and documentation.
