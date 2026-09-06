# Interaction architecture

Drag Dismiss separates continuous interaction mechanics from semantic React state.

## Pointer session snapshot

Pointer down measures the element once and snapshots the axis, logical directions, physical signs, writing direction, threshold, size, and lifecycle callbacks. Prop changes and resizing during that gesture take effect on the next gesture. Pointer movement performs no layout or computed-style reads.

## Continuous DOM state

The interaction controller owns `translate`, `--drag-dismiss-offset`, and `--drag-dismiss-progress` through refs and direct DOM writes. React initializes these values when the node connects but does not render-own them afterward. React state owns only semantic attributes such as `data-state`.

Progress is signed and threshold-relative: zero is origin, `1` or `-1` is the configured threshold, and travel beyond the threshold may exceed that range. Offset is a signed CSS pixel value.

## Ownership and settling

A session starts pending, claims only after dominant-axis intent, and otherwise abandons without preventing default behavior. A claimed cancellation begins an interruptible return. A new gesture starts from the currently rendered return offset. Committed departure is final and cannot be re-grabbed.

Recent sampled velocity participates in both commitment and bounded settle duration. A pause expires stale velocity. The controller measures no geometry during animation frames and schedules no frame while idle.

## Dismiss lifecycle

`onDismiss` reports semantic commitment exactly once before departure. If the node remains mounted, `onDismissComplete` reports visual completion exactly once after the departure target is reached. Unmounting from `onDismiss` safely cancels motion and intentionally prevents completion. The package never manages presence or removes DOM.

## Resource lifecycle

Each idle instance owns only element-level React handlers. The window blur safeguard exists only while a pointer session is active and is removed when that session ends, abandons, or unmounts. There are no observers or idle animation frames.
