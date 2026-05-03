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
    expect(screen.getByRole('button', { name: '出席番号方式' })).toBeTruthy()
    expect(screen.getByDisplayValue('1番')).toBeTruthy()
    expect(screen.getByDisplayValue('30番')).toBeTruthy()
    expect(screen.getByTestId('seat-grid')).toBeTruthy()
  })

  it('generates a seating plan from the default roster', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('generate-button'))

    expect(screen.getByText('席替えを生成しました')).toBeTruthy()
    expect(screen.getByText(/^score\s+-?\d+/)).toBeTruthy()
  })

  it('allows a generated seat to be swapped manually', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('generate-button'))
    fireEvent.click(screen.getByTitle('1行 1列'))
    fireEvent.change(screen.getByLabelText('入れ替え先'), { target: { value: '0-1' } })
    fireEvent.click(screen.getByRole('button', { name: '入れ替え' }))

    expect(screen.getByText('席を入れ替えました')).toBeTruthy()
  })

  it('switches to name mode when the teacher wants a named roster', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '名前方式' }))

    expect(screen.getByPlaceholderText('名前')).toBeTruthy()
    expect((screen.getByLabelText('性別') as HTMLSelectElement).value).toBe('boy')
    expect(screen.getByText('名前方式に切り替えました')).toBeTruthy()
  })
})
