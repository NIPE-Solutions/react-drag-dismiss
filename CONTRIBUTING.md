# Contributing

Use Node 24 and npm 11. Create a focused branch, add regression coverage for behavior changes, and run:

```bash
npm ci
npm run check
npm run test:e2e
```

Keep the package focused on drag-to-dismiss mechanics. Features for data removal, undo, overlays, action rails, sorting, drag-and-drop, or generic gestures are out of scope.

Public API or gesture changes require a regression test, updated compatibility documentation, and a version appropriate to the stable 1.x contract.
