import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import {
  type SeatingPlan,
  STORAGE_KEY,
  adjacencyPairs,
  buildSeatList,
  createInitialState,
  horizontalPairs,
} from './lib/seating'

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

  it('marks alert target seats on the seating board', () => {
    const initial = createInitialState()
    const seats = buildSeatList(initial.classroom)
    const assignments = Object.fromEntries(
      seats.map((seat, index) => [seat, initial.students[index]?.id ?? null]),
    )
    const previousPlan = makeTestPlan('previous-plan', assignments, initial.classroom)
    const currentPlan = {
      ...makeTestPlan('current-plan', assignments, initial.classroom),
      diagnostics: {
        ...previousPlan.diagnostics,
        sameSeatRepeats: seats.length,
        neighborRepeats: previousPlan.pairs.length,
        horizontalPairRepeats: previousPlan.horizontalPairs.length,
      },
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...initial,
        currentPlan,
        history: [previousPlan, currentPlan],
      }),
    )

    render(<App />)

    expect(screen.getByText('同じ席の再発が 30 件あります')).toBeTruthy()
    const alertSeat = screen.getByTitle(/1行 1列 \/ 注意:/)
    expect(alertSeat.className).toContain('alert-target')
    expect(alertSeat.textContent).toContain('注意')
  })
})

function makeTestPlan(
  id: string,
  assignments: Record<string, string | null>,
  classroom: { rows: number; cols: number },
): SeatingPlan {
  return {
    id,
    title: id,
    createdAt: '2026-05-03T00:00:00.000Z',
    rows: classroom.rows,
    cols: classroom.cols,
    score: 0,
    seed: 1,
    assignments,
    pairs: adjacencyPairs(assignments, classroom),
    horizontalPairs: horizontalPairs(assignments, classroom),
    diagnostics: {
      placedStudents: Object.values(assignments).filter(Boolean).length,
      openSeats: Object.keys(assignments).length,
      emptySeats: Object.values(assignments).filter((value) => value === null).length,
      sameSeatRepeats: 0,
      neighborRepeats: 0,
      horizontalPairRepeats: 0,
      frontNeedFrontHalf: 0,
      frontNeedTotal: 0,
      tallBackHalf: 0,
      tallTotal: 0,
    },
  }
}
