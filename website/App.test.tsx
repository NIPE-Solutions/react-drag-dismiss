import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { App } from './App'

describe('documentation site', () => {
  test('leads with the interactive product promise', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: /drag to dismiss/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/without owning what dismissal means/i),
    ).toBeInTheDocument()
  })

  test('documents ownership, accessibility, API, and limitations', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Gesture ownership' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Accessible dismissal' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'API reference' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Known limitations' }),
    ).toBeInTheDocument()
  })
})
