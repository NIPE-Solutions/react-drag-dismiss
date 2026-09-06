import { act, fireEvent, render } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { DragDismiss } from './DragDismiss'

function pointer(target: Element, type: string, init: Record<string, unknown>) {
  fireEvent(
    target,
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      ...init,
    }),
  )
}

function measure(element: Element, width = 200, height = 80) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    }),
  })
}

describe('DragDismiss', () => {
  test('renders arbitrary content with the idle styling contract', () => {
    const { getByTestId } = render(
      <DragDismiss data-testid="root">
        <span>Message</span>
      </DragDismiss>,
    )
    const root = getByTestId('root')
    expect(root).toHaveAttribute('data-state', 'idle')
    expect(root.style.getPropertyValue('--drag-dismiss-offset')).toBe('0px')
    expect(root).toHaveTextContent('Message')
  })

  test('claims only directional movement and commits exactly once', () => {
    const onDismiss = vi.fn()
    const { getByTestId } = render(
      <StrictMode>
        <DragDismiss
          data-testid="root"
          directions={['end']}
          onDismiss={onDismiss}
        >
          Message
        </DragDismiss>
      </StrictMode>,
    )
    const root = getByTestId('root')
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ width: 200, height: 80 }),
    })
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 100,
      clientY: 3,
      pointerType: 'touch',
    })
    expect(root).toHaveAttribute('data-state', 'dragging')
    expect(
      Number(root.style.getPropertyValue('--drag-dismiss-progress')),
    ).toBeCloseTo(1.25)
    pointer(root, 'pointerup', {
      clientX: 100,
      clientY: 3,
      pointerType: 'touch',
    })
    pointer(root, 'pointercancel', {
      clientX: 100,
      clientY: 3,
      pointerType: 'touch',
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith({ direction: 'end' })
  })

  test('continuous progress and offset survive semantic and parent rerenders', () => {
    function Fixture() {
      const [label, setLabel] = useState('Before')
      return (
        <>
          <button onClick={() => setLabel('After')}>Rerender</button>
          <DragDismiss data-testid="root">{label}</DragDismiss>
        </>
      )
    }
    const { getByRole, getByTestId } = render(<Fixture />)
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 100,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(root.style.getPropertyValue('--drag-dismiss-progress')).toBe('1.25')
    expect(root.style.getPropertyValue('--drag-dismiss-offset')).toBe('100px')
    fireEvent.click(getByRole('button', { name: 'Rerender' }))
    expect(root).toHaveTextContent('After')
    expect(root.style.getPropertyValue('--drag-dismiss-progress')).toBe('1.25')
    expect(root.style.getPropertyValue('--drag-dismiss-offset')).toBe('100px')
  })

  test('validates impossible public configuration precisely', () => {
    expect(() =>
      render(<DragDismiss directions={[]}>Item</DragDismiss>),
    ).toThrow('`directions` must contain at least one direction.')
    expect(() =>
      render(<DragDismiss directions={['start', 'down']}>Item</DragDismiss>),
    ).toThrow(
      '`directions` must belong to one axis. Received "start" and "down".',
    )
    for (const threshold of [0, -0.1, 1.1, Number.NaN, Infinity]) {
      expect(() =>
        render(<DragDismiss threshold={threshold}>Item</DragDismiss>),
      ).toThrow(
        '`threshold` must be a finite number greater than 0 and less than or equal to 1.',
      )
    }
  })

  test('fires commit then completion exactly once when departure finishes', async () => {
    const order: string[] = []
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { getByTestId } = render(
      <DragDismiss
        data-testid="root"
        onDismiss={() => order.push('commit')}
        onDismissComplete={() => order.push('complete')}
      >
        Item
      </DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 100,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointerup', {
      clientX: 100,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointercancel', {
      clientX: 100,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(order).toEqual(['commit'])
    await act(async () => Promise.resolve())
    expect(order).toEqual(['commit', 'complete'])
    vi.unstubAllGlobals()
  })

  test('committed departure never reverses from an overshot release', () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback
        return 1
      }),
    )
    const { getByTestId } = render(
      <DragDismiss data-testid="root">Item</DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 400,
      clientY: 0,
      pointerType: 'touch',
    })
    const releasedAt = Number.parseFloat(
      root.style.getPropertyValue('--drag-dismiss-offset'),
    )
    pointer(root, 'pointerup', {
      clientX: 400,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(releasedAt).toBeLessThan(250)
    expect(releasedAt).toBeGreaterThan(200)
    act(() => frame?.(performance.now() + 16))
    expect(
      Number.parseFloat(root.style.getPropertyValue('--drag-dismiss-offset')),
    ).toBeGreaterThan(releasedAt)
    vi.unstubAllGlobals()
  })

  test('cancel fires neither dismissal lifecycle callback', () => {
    const onDismiss = vi.fn()
    const onDismissComplete = vi.fn()
    const { getByTestId } = render(
      <DragDismiss
        data-testid="root"
        onDismiss={onDismiss}
        onDismissComplete={onDismissComplete}
      >
        Item
      </DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 10,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointerup', {
      clientX: 10,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(onDismiss).not.toHaveBeenCalled()
    expect(onDismissComplete).not.toHaveBeenCalled()
  })

  test('unmounting from onDismiss is safe and does not call completion', () => {
    const onDismissComplete = vi.fn()
    function Fixture() {
      const [visible, setVisible] = useState(true)
      return visible ? (
        <DragDismiss
          data-testid="root"
          onDismiss={() => setVisible(false)}
          onDismissComplete={onDismissComplete}
        >
          Item
        </DragDismiss>
      ) : null
    }
    const { getByTestId } = render(<Fixture />)
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 100,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(() =>
      pointer(root, 'pointerup', {
        clientX: 100,
        clientY: 0,
        pointerType: 'touch',
      }),
    ).not.toThrow()
    expect(onDismissComplete).not.toHaveBeenCalled()
  })

  test('preserves a consumer transform while applying drag translation', () => {
    const { getByTestId } = render(
      <DragDismiss
        data-testid="root"
        style={{ transform: 'scale(.9) rotate(2deg)' }}
      >
        Item
      </DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(root.style.transform).toBe('scale(.9) rotate(2deg)')
    expect(root.style.translate).toBe('40px 0px')
  })

  test.each(['input', 'textarea', 'select', 'contenteditable'])(
    'does not start a touch drag from %s',
    (kind) => {
      const child =
        kind === 'input' ? (
          <input aria-label="field" />
        ) : kind === 'textarea' ? (
          <textarea aria-label="field" />
        ) : kind === 'select' ? (
          <select aria-label="field">
            <option>One</option>
          </select>
        ) : (
          <div role="textbox" contentEditable aria-label="field" />
        )
      const { getByLabelText, getByTestId } = render(
        <DragDismiss data-testid="root">{child}</DragDismiss>,
      )
      const control = getByLabelText('field')
      pointer(control, 'pointerdown', {
        clientX: 0,
        clientY: 0,
        pointerType: 'touch',
      })
      pointer(control, 'pointermove', {
        clientX: 80,
        clientY: 0,
        pointerType: 'touch',
      })
      expect(getByTestId('root')).toHaveAttribute('data-state', 'idle')
    },
  )

  test('data-drag-dismiss-ignore excludes custom interactive descendants', () => {
    const { getByTestId } = render(
      <DragDismiss data-testid="root">
        <div data-testid="map" data-drag-dismiss-ignore>
          Map
        </div>
      </DragDismiss>,
    )
    const map = getByTestId('map')
    pointer(map, 'pointerdown', { clientX: 0, clientY: 0, pointerType: 'pen' })
    pointer(map, 'pointermove', { clientX: 80, clientY: 0, pointerType: 'pen' })
    expect(getByTestId('root')).toHaveAttribute('data-state', 'idle')
  })

  test('allows a real drag from a button and suppresses its release click', () => {
    const onClick = vi.fn()
    const { getByRole, getByTestId } = render(
      <DragDismiss data-testid="root">
        <button onClick={onClick}>Action</button>
      </DragDismiss>,
    )
    const root = getByTestId('root')
    const button = getByRole('button')
    measure(root)
    pointer(button, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(button, 'pointermove', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(button, 'pointerup', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    fireEvent.click(button, { detail: 1 })
    expect(onClick).not.toHaveBeenCalled()
  })

  test('pointer cancellation does not suppress a later click on an ignored control', () => {
    const onClick = vi.fn()
    const { getByLabelText, getByTestId } = render(
      <DragDismiss data-testid="root">
        <input aria-label="Field" onClick={onClick} />
      </DragDismiss>,
    )
    const root = getByTestId('root')
    const input = getByLabelText('Field')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointercancel', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(input, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    fireEvent.click(input, { detail: 1 })
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('attaches blur only for a pointer session and removes it when pending ends', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { getByTestId } = render(
      <DragDismiss data-testid="root">Row</DragDismiss>,
    )
    const root = getByTestId('root')
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    const registration = add.mock.calls.find(([type]) => type === 'blur')
    expect(registration).toBeDefined()
    pointer(root, 'pointerup', { clientX: 0, clientY: 0, pointerType: 'touch' })
    expect(remove).toHaveBeenCalledWith('blur', registration?.[1])
    add.mockRestore()
    remove.mockRestore()
  })

  test('snapshots directions, threshold, and size for the active gesture', () => {
    const onDismiss = vi.fn()
    const { getByTestId, rerender } = render(
      <DragDismiss
        data-testid="root"
        directions={['end']}
        threshold={0.4}
        onDismiss={onDismiss}
      >
        Row
      </DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root, 200)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    rerender(
      <DragDismiss
        data-testid="root"
        directions={['start']}
        threshold={0.9}
        onDismiss={onDismiss}
      >
        Row
      </DragDismiss>,
    )
    measure(root, 1000)
    pointer(root, 'pointermove', {
      clientX: 100,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointerup', {
      clientX: 100,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(onDismiss).toHaveBeenCalledWith({ direction: 'end' })
  })

  test('disabled during a claimed drag cancels safely', () => {
    const onDragEnd = vi.fn()
    const { getByTestId, rerender } = render(
      <DragDismiss data-testid="root" onDragEnd={onDragEnd}>
        Row
      </DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 30,
      clientY: 0,
      pointerType: 'touch',
    })
    rerender(
      <DragDismiss data-testid="root" disabled onDragEnd={onDragEnd}>
        Row
      </DragDismiss>,
    )
    expect(onDragEnd).toHaveBeenCalledOnce()
    expect(onDragEnd).toHaveBeenCalledWith({ dismissed: false })
    expect(root).toHaveAttribute('data-state', 'settling')
  })

  test('re-grabs snap-back from its current rendered offset without a jump', () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { getByTestId } = render(
      <DragDismiss data-testid="root">Row</DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointercancel', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    act(() => frame?.(performance.now() + 80))
    const rendered = Number.parseFloat(
      root.style.getPropertyValue('--drag-dismiss-offset'),
    )
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(40)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(
      Number.parseFloat(root.style.getPropertyValue('--drag-dismiss-offset')),
    ).toBeCloseTo(rendered)
    pointer(root, 'pointermove', {
      clientX: 10,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(
      Number.parseFloat(root.style.getPropertyValue('--drag-dismiss-offset')),
    ).toBeCloseTo(rendered + 10)
    vi.unstubAllGlobals()
  })

  test('a tap that interrupts snap-back resumes the return instead of stranding offset', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { getByTestId } = render(
      <DragDismiss data-testid="root">Row</DragDismiss>,
    )
    const root = getByTestId('root')
    measure(root)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointermove', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointercancel', {
      clientX: 40,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(frames).toHaveLength(1)
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    pointer(root, 'pointerup', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(frames).toHaveLength(2)
    expect(root).toHaveAttribute('data-state', 'settling')
    vi.unstubAllGlobals()
  })

  test('1000 idle instances do not register window blur listeners or RAF', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const { container } = render(
      <>
        {Array.from({ length: 1000 }, (_, index) => (
          <DragDismiss key={index}>Row</DragDismiss>
        ))}
      </>,
    )
    expect(add.mock.calls.filter(([type]) => type === 'blur')).toHaveLength(0)
    expect(raf).not.toHaveBeenCalled()
    const first = container.querySelector('[data-drag-dismiss]')
    if (!first) throw new Error('Large-list fixture did not render')
    pointer(first, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    expect(add.mock.calls.filter(([type]) => type === 'blur')).toHaveLength(1)
    expect(raf).not.toHaveBeenCalled()
    add.mockRestore()
    raf.mockRestore()
  })

  test('abandons a perpendicular gesture without preventing it', () => {
    const { getByTestId } = render(
      <DragDismiss data-testid="root">Message</DragDismiss>,
    )
    const root = getByTestId('root')
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'touch',
    })
    const move = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      clientX: 2,
      clientY: 20,
    })
    fireEvent(root, move)
    expect(move.defaultPrevented).toBe(false)
    expect(root).toHaveAttribute('data-state', 'idle')
  })

  test('disabled preserves normal interaction', () => {
    const onDismiss = vi.fn()
    const { getByTestId } = render(
      <DragDismiss data-testid="root" disabled onDismiss={onDismiss}>
        Message
      </DragDismiss>,
    )
    const root = getByTestId('root')
    pointer(root, 'pointerdown', { clientX: 0, clientY: 0 })
    pointer(root, 'pointermove', { clientX: 100, clientY: 0 })
    pointer(root, 'pointerup', { clientX: 100, clientY: 0 })
    expect(onDismiss).not.toHaveBeenCalled()
    expect(root).toHaveAttribute('data-disabled', '')
  })

  test('keeps a small mouse movement on a button as a click', () => {
    const onClick = vi.fn()
    const { getByRole, getByTestId } = render(
      <DragDismiss data-testid="root">
        <button onClick={onClick}>Dismiss</button>
      </DragDismiss>,
    )
    const button = getByRole('button')
    pointer(button, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'mouse',
    })
    pointer(button, 'pointermove', {
      clientX: 2,
      clientY: 0,
      pointerType: 'mouse',
    })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
    expect(getByTestId('root')).toHaveAttribute('data-state', 'idle')
  })

  test('suppresses only the release click from a claimed drag', () => {
    const onClick = vi.fn()
    const { getByTestId } = render(
      <DragDismiss data-testid="root" onClick={onClick}>
        Message
      </DragDismiss>,
    )
    const root = getByTestId('root')
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ width: 200, height: 80 }),
    })
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'mouse',
    })
    pointer(root, 'pointermove', {
      clientX: 30,
      clientY: 0,
      pointerType: 'mouse',
    })
    pointer(root, 'pointerup', {
      clientX: 30,
      clientY: 0,
      pointerType: 'mouse',
    })
    fireEvent.click(root, { detail: 1 })
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(root, { detail: 1 })
    expect(onClick).toHaveBeenCalledOnce()
  })
})
