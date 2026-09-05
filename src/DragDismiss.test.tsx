import { fireEvent, render } from '@testing-library/react'
import { StrictMode } from 'react'
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

  test('does not start a mouse drag from an interactive child', () => {
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
      clientX: 100,
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
    pointer(root, 'pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerType: 'mouse',
    })
    pointer(root, 'pointerup', { clientX: 0, clientY: 0, pointerType: 'mouse' })
    fireEvent.click(root, { detail: 1 })
    expect(onClick).toHaveBeenCalledOnce()
  })
})
