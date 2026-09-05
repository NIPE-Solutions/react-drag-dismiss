import { useState } from 'react'
import {
  DragDismiss,
  type DragDismissDirection,
} from '@nipe-solutions/react-drag-dismiss'

const code = `import { DragDismiss } from '@nipe-solutions/react-drag-dismiss'

<DragDismiss
  directions={['start', 'end']}
  onDismiss={({ direction }) => removeItem(id, direction)}
>
  <Notification />
</DragDismiss>`

function DemoCard({
  directions = ['start', 'end'],
  label = 'Release notes are ready',
}: {
  directions?: readonly DragDismissDirection[]
  label?: string
}) {
  const [visible, setVisible] = useState(true)
  return (
    <div className="demo-stage">
      <span className="boundary boundary-start">dismiss</span>
      <span className="boundary boundary-end">dismiss</span>
      {visible ? (
        <DragDismiss
          className="demo-card"
          directions={directions}
          onDismiss={() => setVisible(false)}
        >
          <span className="demo-mark" aria-hidden="true">
            N
          </span>
          <span>
            <strong>{label}</strong>
            <small>Drag the surface. Release to commit.</small>
          </span>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Dismiss demo notification"
          >
            ×
          </button>
        </DragDismiss>
      ) : (
        <div className="departed">
          <span>The surface departed.</span>
          <button type="button" onClick={() => setVisible(true)}>
            Reset demo
          </button>
        </div>
      )}
    </div>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="doc-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function App() {
  const [direction, setDirection] = useState<DragDismissDirection>('end')
  const [rtl, setRtl] = useState(false)
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="React Drag Dismiss home">
          <span>NIPE</span> React Drag Dismiss
        </a>
        <nav aria-label="Primary">
          <a href="#start">Start</a>
          <a href="#interaction">Interaction</a>
          <a href="#api">API</a>
          <a href="https://github.com/NIPE-Solutions/react-drag-dismiss">
            GitHub
          </a>
        </nav>
      </header>
      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="status">
              <span /> 0.1.0 alpha
            </p>
            <h1>Drag to dismiss.</h1>
            <p className="hero-principle">
              Without owning what dismissal means.
            </p>
            <p className="lede">
              Intent, velocity, resistance and settling for arbitrary React
              content. Your application keeps ownership of state and side
              effects.
            </p>
            <div className="actions">
              <a className="primary" href="#start">
                Start building
              </a>
              <a href="https://github.com/NIPE-Solutions/react-drag-dismiss">
                View source
              </a>
            </div>
          </div>
          <div className="hero-demo">
            <DemoCard />
          </div>
        </section>

        <section className="principle-strip" aria-label="Package principles">
          <p>
            <strong>Clear intent</strong>
            <span>Waits until direction wins.</span>
          </p>
          <p>
            <strong>Application-owned</strong>
            <span>One semantic callback.</span>
          </p>
          <p>
            <strong>Zero runtime dependencies</strong>
            <span>React is a peer.</span>
          </p>
        </section>

        <div className="docs-layout">
          <aside>
            <nav aria-label="Documentation">
              <a href="#start">Quick start</a>
              <a href="#ownership">Gesture ownership</a>
              <a href="#motion">Motion model</a>
              <a href="#lab">Gesture Lab</a>
              <a href="#integration">Integration</a>
              <a href="#comparison">vs Swipe Actions</a>
              <a href="#accessibility">Accessibility</a>
              <a href="#styling">Styling</a>
              <a href="#api">API reference</a>
              <a href="#limitations">Limitations</a>
            </nav>
          </aside>
          <article>
            <Section id="start" title="Quick start">
              <p>
                Install the package, import its mechanical CSS, and decide what
                dismissal means in your own state.
              </p>
              <pre>
                <code>npm install @nipe-solutions/react-drag-dismiss</code>
              </pre>
              <pre>
                <code>{code}</code>
              </pre>
              <p>
                The wrapper adds no role, label, focus behavior, removal logic,
                or data persistence.
              </p>
            </Section>

            <Section id="ownership" title="Gesture ownership">
              <div className="lifecycle">
                <span>
                  pointer down<small>pending</small>
                </span>
                <i />
                <span>
                  axis intent<small>claim or abandon</small>
                </span>
                <i />
                <span>
                  release<small>commit or return</small>
                </span>
              </div>
              <p>
                The gesture begins pending. Movement inside the dead zone stays
                a click. Once one axis clearly dominates, Drag Dismiss either
                captures the pointer or abandons the session so scrolling and
                neighboring gestures remain natural.
              </p>
              <p>
                Horizontal dismissal uses <code>touch-action: pan-y</code>;
                vertical dismissal uses <code>pan-x</code>. It never globally
                suppresses browser navigation or scrolling.
              </p>
            </Section>

            <Section id="motion" title="Threshold, velocity and motion">
              <p>
                The default threshold is 40% of the current element size,
                measured when the gesture starts. A short flick can commit only
                after meaningful travel. Velocity comes from recent samples, so
                a pause removes stale momentum and a reversal follows the latest
                intent.
              </p>
              <p>
                Unsupported directions receive restrained resistance. Canceled
                gestures settle to origin and can be grabbed again from their
                current visual position. A committed release calls{' '}
                <code>onDismiss</code> immediately and continues off the
                measured edge if the consumer keeps it mounted.
              </p>
            </Section>

            <Section id="lab" title="Gesture Lab">
              <div className="lab-controls">
                <label>
                  Direction
                  <select
                    value={direction}
                    onChange={(event) =>
                      setDirection(event.target.value as DragDismissDirection)
                    }
                  >
                    <option value="start">start</option>
                    <option value="end">end</option>
                    <option value="up">up</option>
                    <option value="down">down</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={rtl}
                    onChange={(event) => setRtl(event.target.checked)}
                  />{' '}
                  RTL context
                </label>
              </div>
              <div dir={rtl ? 'rtl' : 'ltr'}>
                <DemoCard
                  key={`${direction}-${rtl}`}
                  directions={[direction]}
                  label={`${direction} dismissal in ${rtl ? 'RTL' : 'LTR'}`}
                />
              </div>
            </Section>

            <Section id="integration" title="Integration patterns">
              <div className="two-col">
                <div>
                  <h3>Scrolling feeds</h3>
                  <p>
                    Use horizontal dismissal in vertically scrolling feeds. Axis
                    arbitration waits for intent before ownership.
                  </p>
                </div>
                <div>
                  <h3>Interactive children</h3>
                  <p>
                    Buttons, links, form controls, and text keep their normal
                    behavior. Mouse drags do not originate from interactive
                    controls.
                  </p>
                </div>
                <div>
                  <h3>Pull to Refresh</h3>
                  <p>
                    Horizontal Drag Dismiss can sit inside vertical Pull to
                    Refresh content without a runtime dependency.
                  </p>
                </div>
                <div>
                  <h3>Bottom Sheet</h3>
                  <p>
                    Prefer horizontal card dismissal inside vertical sheet
                    content. For same-axis nesting, use a separate explicit
                    gesture surface.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="comparison" title="Drag Dismiss vs Swipe Actions">
              <div className="comparison">
                <div>
                  <h3>Drag Dismiss</h3>
                  <p>
                    The drag itself communicates exit intent. The surface
                    commits or returns; there is no action rail.
                  </p>
                </div>
                <div>
                  <h3>Swipe Actions</h3>
                  <p>
                    The drag reveals one or more actions and the surface
                    generally remains. Choose one horizontal owner on a surface.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="accessibility" title="Accessible dismissal">
              <blockquote>
                Drag dismissal is an additional interaction, not an accessible
                replacement for a semantic dismiss control.
              </blockquote>
              <p>
                Use the same application handler from a clearly named button.
                The application decides focus after unmount. Drag Dismiss
                injects no ARIA and invents no keyboard shortcuts.
              </p>
              <pre>
                <code>{`const dismiss = () => removeNotification(id)\n\n<button onClick={dismiss}>Dismiss notification</button>\n<DragDismiss onDismiss={dismiss}>…</DragDismiss>`}</code>
              </pre>
            </Section>

            <Section id="styling" title="Styling contract">
              <p>
                <code>--drag-dismiss-offset</code> is the signed pixel offset.{' '}
                <code>--drag-dismiss-progress</code> is signed and equals 1 or
                −1 at the configured threshold; it may exceed that range.
              </p>
              <p>
                Stable attributes are{' '}
                <code>data-state="idle|dragging|settling|dismissed"</code>,{' '}
                <code>data-dismiss-intent="true"</code>, and{' '}
                <code>data-disabled</code>. Core motion translates only;
                opacity, scale, and rotation remain yours.
              </p>
            </Section>

            <Section id="api" title="API reference">
              <div className="api-table" aria-label="DragDismiss props">
                <div>
                  <strong>Prop</strong>
                  <strong>Contract</strong>
                </div>
                <div>
                  <code>directions</code>
                  <span>
                    Logical directions; default <code>['end']</code>. Keep
                    directions on one axis.
                  </span>
                </div>
                <div>
                  <code>threshold</code>
                  <span>
                    Element-size ratio; default <code>0.4</code>.
                  </span>
                </div>
                <div>
                  <code>disabled</code>
                  <span>
                    Cancels safely and leaves child interaction unchanged.
                  </span>
                </div>
                <div>
                  <code>onDismiss</code>
                  <span>
                    Called once at commit with <code>{`{ direction }`}</code>.
                  </span>
                </div>
                <div>
                  <code>onDragStart / onDragEnd</code>
                  <span>Low-frequency semantic lifecycle callbacks.</span>
                </div>
              </div>
            </Section>

            <Section id="limitations" title="Known limitations">
              <ul>
                <li>
                  Same-axis nested scrollers and nested Drag Dismiss roots
                  require an explicit interaction boundary.
                </li>
                <li>
                  Horizontal drags near a viewport edge may conflict with iOS
                  browser history navigation; the package does not suppress it
                  globally.
                </li>
                <li>
                  A committed callback may unmount immediately and therefore cut
                  the optional exit motion short.
                </li>
                <li>
                  Physical iOS and Android device QA is pending for this alpha.
                </li>
              </ul>
            </Section>
          </article>
        </div>
      </main>
      <footer>
        <p>
          Part of{' '}
          <a href="https://opensource.nipesolutions.com">NIPE Open Source</a>.
        </p>
        <nav aria-label="Legal">
          <a href="https://opensource.nipesolutions.com/impressum">Imprint</a>
          <a href="https://opensource.nipesolutions.com/privacy">Privacy</a>
        </nav>
      </footer>
    </>
  )
}
