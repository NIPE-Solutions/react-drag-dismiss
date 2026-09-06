# Performance notes

The performance fixture mounts 1,000 independent `DragDismiss` instances and instruments resources owned by the package.

While idle, the group creates no window blur listeners, animation frames, or observers. Each instance retains only its element-level React pointer handlers and refs. Starting one gesture attaches one session-scoped blur listener, measures that element once, and leaves the other 999 instances inactive. Ending, abandoning, disabling, or unmounting the active session removes that listener.

Pointer movement writes `translate`, offset, progress, and semantic data attributes directly to the active element. It performs no React render per frame, computed-style lookup, or geometry measurement. Settle frames reuse the gesture-start size and configuration snapshot.

These are qualitative resource invariants rather than timing claims. Render duration depends on React mode, consumer content, browser, and device, so the project does not advertise a synthetic rows-per-second benchmark.
