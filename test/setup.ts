import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class TestPointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  isPrimary: boolean

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
    this.pointerType = init.pointerType ?? ''
    this.isPrimary = init.isPrimary ?? false
  }
}

if (!globalThis.PointerEvent) {
  Object.defineProperty(globalThis, 'PointerEvent', { value: TestPointerEvent })
}

afterEach(cleanup)
