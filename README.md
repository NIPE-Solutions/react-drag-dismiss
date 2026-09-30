# React Drag Dismiss

Drag-to-dismiss mechanics for arbitrary React content.

Intent detection, velocity, resistance and settling without owning your application state.

Version 1.x is stable and supports React 18.3 and React 19.

```bash
npm install @nipe-solutions/react-drag-dismiss
```

```tsx
import { DragDismiss } from '@nipe-solutions/react-drag-dismiss'
import '@nipe-solutions/react-drag-dismiss/core.css'

;<DragDismiss
  directions={['start', 'end']}
  onDismiss={({ direction }) => recordCommit(id, direction)}
  onDismissComplete={() => removeItem(id)}
>
  <Notification />
</DragDismiss>
```

`start` and `end` follow the nearest `dir` context. `up` and `down` are physical vertical directions. Keep a root's directions on one axis.

The package detects intent and provides motion mechanics. Your application owns removal, unmounting, undo, focus, persistence, and side effects. Always provide an accessible semantic control for required dismissal actions.

`onDismiss` fires once when release commits. Optional `onDismissComplete` fires once after a mounted departure reaches its visual target; it does not fire if the consumer unmounts first. Use `data-drag-dismiss-ignore` on custom controls that must never initiate a gesture. Inputs, textareas, selects, and contenteditable descendants are ignored automatically.

Automated interaction coverage runs in desktop Chromium, Firefox, and WebKit. Physical iOS and Android testing and human screen-reader testing were not performed for 1.0.0; desktop WebKit is not a substitute for iOS Safari. Always keep an ordinary semantic control available for dismissal.

Full documentation: [react-drag-dismiss.nipesolutions.com](https://react-drag-dismiss.nipesolutions.com)

Part of [NIPE Open Source](https://opensource.nipesolutions.com).

## Development

Requires Node 24 and npm 11.

```bash
npm install
npm run check
npm run test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [interaction architecture](docs/ARCHITECTURE.md), [performance notes](docs/PERFORMANCE.md), and [real-device QA](docs/REAL_DEVICE_QA.md).

## License

MIT © NIPE Solutions
