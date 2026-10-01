# React Drag Dismiss

Let people drag a notification, card, or other React content away. Use it when
the content already has a dismissal action and a pointer gesture would make
that action easier to reach.

`DragDismiss` handles directional intent, recent velocity, resistance, and
departure or snap-back motion. Your application decides what dismissal means:
remove an item, persist a change, offer undo, or move focus. The component works
with your existing markup and does not manage presence or list data.

[Try the demos and read the docs](https://react-drag-dismiss.nipesolutions.com) ·
[npm package](https://www.npmjs.com/package/@nipe-solutions/react-drag-dismiss)

## Add dismissal to a notice

```bash
npm install @nipe-solutions/react-drag-dismiss
```

React 18.3 and React 19 are supported peers. The package has no additional
runtime dependencies.

The parent owns removal: pass `onRemove` to update your list or visibility state.
A completed drag waits for the departure animation before calling it; the
ordinary button calls it directly.

```tsx
import { DragDismiss } from '@nipe-solutions/react-drag-dismiss'
import '@nipe-solutions/react-drag-dismiss/core.css'

interface DismissibleNoticeProps {
  message: string
  onRemove: () => void
}

export function DismissibleNotice({
  message,
  onRemove,
}: DismissibleNoticeProps) {
  return (
    <DragDismiss directions={['start', 'end']} onDismissComplete={onRemove}>
      <aside aria-label="Notification">
        <p>{message}</p>
        <button type="button" data-drag-dismiss-ignore onClick={onRemove}>
          Dismiss notification
        </button>
      </aside>
    </DragDismiss>
  )
}
```

Keep the semantic button available. The gesture does not provide keyboard
dismissal, a live announcement, or focus management. If removing the notice also
removes the focused control, your application should move focus to a suitable
remaining control or announce the resulting change when useful.

## Pick a direction and commitment point

`start` and `end` follow the nearest `dir` context; `up` and `down` are physical
vertical directions. All configured directions must belong to one axis.
The default is `['end']`. Horizontal dismissal allows vertical scrolling;
vertical dismissal reserves the vertical axis, so avoid it on surfaces where
vertical scrolling is the primary interaction.

`threshold` defaults to `0.4`, a fraction of the element's width or height along
the configured axis. It must be finite, greater than zero, and at most one.
Recent velocity also participates in the release decision, so a sufficiently
fast flick can commit before reaching the distance threshold. A canceled or
uncommitted drag returns to its starting position.

The two dismissal callbacks have different purposes:

| Callback                           | When it runs                                        | Typical application work                          |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| `onDismiss({ direction })`         | Once, when release commits.                         | Record the action or begin a persistence request. |
| `onDismissComplete({ direction })` | Once, after a mounted departure reaches its target. | Remove the item after the animation.              |

Unmounting in `onDismiss` cancels motion and prevents `onDismissComplete`.
Choose the callback that matches your removal timing. The library does not
await async callbacks, roll back failed requests, or provide undo.
`onDragStart` and `onDragEnd` are available for application drag-state feedback;
`onDragEnd` reports whether the gesture dismissed and, if so, its direction.

## Styling and interactive children

Import `core.css` for mechanical translation defaults. There is no bundled
visual theme; apply your product's card, notice, or list styling to the content.
The component writes the CSS `translate` property, allowing a separate consumer
`transform` to compose with its motion. Leave `translate` under its control and
avoid adding a competing translation transition.

For visual feedback, the root exposes `data-state` (`idle`, `dragging`,
`settling`, or `dismissed`), `data-direction`, and `data-dismiss-intent`.
`--drag-dismiss-offset` is a signed pixel value; `--drag-dismiss-progress` is
signed and relative to the configured threshold, so it may exceed `1` or `-1`.
Built-in settling respects reduced-motion preferences.

Inputs, textareas, selects, and editable content do not start a drag. Buttons
and links can be drag origins unless marked `data-drag-dismiss-ignore`, as in
the example. Mark other custom controls the same way when they must keep their
own pointer interaction. `disabled` prevents dragging; it does not replace
application control of the fallback button.

## Before shipping

Use this for dismissible content, not as a substitute for a confirmation flow
or a complete modal, toast, or list implementation. Removal, undo, focus,
persistence, and side effects remain application responsibilities.

Automated interaction coverage runs in desktop Chromium, Firefox, and WebKit.
Physical iOS and Android testing and human screen-reader testing were not
performed for 1.0.0. Desktop WebKit is not physical iOS Safari evidence. Check
scroll coexistence and browser-edge gestures on your target devices using the
[real-device QA checklist](docs/REAL_DEVICE_QA.md).

## Contributing

Requires Node 24 and npm 11.

```bash
npm install
npm run check
npm run test:e2e
```

See [contributing](CONTRIBUTING.md), [security reporting](SECURITY.md),
[interaction architecture](docs/ARCHITECTURE.md), and
[performance notes](docs/PERFORMANCE.md). Part of
[NIPE Open Source](https://opensource.nipesolutions.com).

## License

[MIT](LICENSE) © NIPE Solutions
