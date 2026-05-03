import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './lib/seating'

describe('App', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  it('renders the teacher workbench with default roster', () => {
    render(<App />)

    expect(screen.getByText('席替え 5.5')).toBeTruthy()
    expect(screen.getByDisplayValue('あおい')).toBeTruthy()
    expect(screen.getByTestId('seat-grid')).toBeTruthy()
  })

  it('generates a seating plan from the default roster', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('generate-button'))

    expect(screen.getByText('席替えを生成しました')).toBeTruthy()
    expect(screen.getByText(/score/)).toBeTruthy()
  })
})
