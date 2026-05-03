import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTIONS,
  adjacencyPairs,
  createInitialState,
  generateSeatingPlan,
  makeStudent,
  parseRosterText,
  seatKey,
} from './seating'

describe('parseRosterText', () => {
  it('supports current and legacy CSV/TSV roster formats', () => {
    const students = parseRosterText(
      ['名前,性別,視力,身長,メモ', 'あおい,女子,前方,標準,黒板', 'はると\t男子\t標準\t後方\t背が高い', 'なお,前方,標準,旧形式'].join(
        '\n',
      ),
    )

    expect(students).toHaveLength(3)
    expect(students[0]).toMatchObject({ name: 'あおい', gender: 'girl', vision: 'front' })
    expect(students[1]).toMatchObject({ name: 'はると', gender: 'boy', height: 'back' })
    expect(students[2]).toMatchObject({ name: 'なお', gender: 'unspecified', vision: 'front' })
  })
})

describe('createInitialState', () => {
  it('defaults to attendance-number mode with one student per seat', () => {
    const state = createInitialState()

    expect(state.rosterMode).toBe('attendance')
    expect(state.students).toHaveLength(state.classroom.rows * state.classroom.cols)
    expect(state.students[0]).toMatchObject({ name: '1', attendanceNumber: 1 })
    expect(state.students.at(-1)).toMatchObject({ name: '30', attendanceNumber: 30 })
  })
})

describe('generateSeatingPlan', () => {
  const students = [
    makeStudent('あおい', 'girl', 'front'),
    makeStudent('はると', 'boy', 'standard', 'back'),
    makeStudent('みなと', 'boy'),
    makeStudent('さくら', 'girl'),
    makeStudent('ゆい', 'girl', 'front'),
  ]

  it('keeps unavailable seats empty and fixed students in place', () => {
    const result = generateSeatingPlan({
      students,
      classroom: {
        rows: 2,
        cols: 3,
        unavailableSeats: [seatKey(1, 2)],
        fixedAssignments: { [seatKey(0, 0)]: students[0].id },
      },
      options: { ...DEFAULT_OPTIONS, trials: 30, improvementSteps: 60 },
      history: [],
      seed: 55,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const placed = Object.values(result.plan.assignments).filter(Boolean)
    expect(result.plan.assignments[seatKey(1, 2)]).toBeNull()
    expect(result.plan.assignments[seatKey(0, 0)]).toBe(students[0].id)
    expect(new Set(placed).size).toBe(students.length)
    expect(result.plan.diagnostics.placedStudents).toBe(students.length)
  })

  it('returns a capacity error before attempting impossible seating', () => {
    const result = generateSeatingPlan({
      students,
      classroom: {
        rows: 1,
        cols: 4,
        unavailableSeats: [],
        fixedAssignments: {},
      },
      options: DEFAULT_OPTIONS,
      history: [],
      seed: 12,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('使える席が足りません')
  })

  it('records adjacency pairs for history comparison', () => {
    const result = generateSeatingPlan({
      students: students.slice(0, 4),
      classroom: {
        rows: 2,
        cols: 2,
        unavailableSeats: [],
        fixedAssignments: {},
      },
      options: { ...DEFAULT_OPTIONS, trials: 20, improvementSteps: 40 },
      history: [],
      seed: 77,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(adjacencyPairs(result.plan.assignments, result.plan)).toEqual(result.plan.pairs)
    expect(result.plan.horizontalPairs.length).toBeGreaterThan(0)
  })
})
