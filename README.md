# React Drag Dismiss

Drag-to-dismiss mechanics for arbitrary React content.

Intent detection, velocity, resistance and settling without owning your application state.

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
