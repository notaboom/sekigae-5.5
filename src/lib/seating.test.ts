import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTIONS,
  type SeatingPlan,
  adjacencyPairs,
  createInitialState,
  generateSeatingPlan,
  horizontalPairs,
  makeStudent,
  parseRosterText,
  seatKey,
  updatePlanAssignments,
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
    expect(state.students[0]).toMatchObject({ name: '1', attendanceNumber: 1, gender: 'boy' })
    expect(state.students.at(-1)).toMatchObject({ name: '30', attendanceNumber: 30, gender: 'boy' })
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
      separationRules: [],
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
      separationRules: [],
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
      separationRules: [],
      options: { ...DEFAULT_OPTIONS, trials: 20, improvementSteps: 40 },
      history: [],
      seed: 77,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(adjacencyPairs(result.plan.assignments, result.plan)).toEqual(result.plan.pairs)
    expect(result.plan.horizontalPairs.length).toBeGreaterThan(0)
  })

  it('counts adjacent students who are marked as separated', () => {
    const pair = [makeStudent('あおい'), makeStudent('はると')]
    const result = generateSeatingPlan({
      students: pair,
      classroom: {
        rows: 1,
        cols: 2,
        unavailableSeats: [],
        fixedAssignments: {},
      },
      separationRules: [{ id: 'rule-1', leftStudentId: pair[0].id, rightStudentId: pair[1].id, note: '相性' }],
      options: { ...DEFAULT_OPTIONS, trials: 1, improvementSteps: 0 },
      history: [],
      seed: 1,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.diagnostics.separationViolations).toBe(1)
  })

  it('respects the selected recurrence history depth', () => {
    const students = [makeStudent('あおい'), makeStudent('はると')]
    const classroom = { rows: 1, cols: 4, unavailableSeats: [], fixedAssignments: {} }
    const olderRepeat = makePlan('older-repeat', classroom, {
      [seatKey(0, 0)]: students[0].id,
      [seatKey(0, 1)]: students[1].id,
      [seatKey(0, 2)]: null,
      [seatKey(0, 3)]: null,
    })
    const recentA = makePlan('recent-a', classroom, {
      [seatKey(0, 0)]: null,
      [seatKey(0, 1)]: students[0].id,
      [seatKey(0, 2)]: null,
      [seatKey(0, 3)]: students[1].id,
    })
    const recentB = makePlan('recent-b', classroom, {
      [seatKey(0, 0)]: students[1].id,
      [seatKey(0, 1)]: null,
      [seatKey(0, 2)]: students[0].id,
      [seatKey(0, 3)]: null,
    })
    const recentC = makePlan('recent-c', classroom, {
      [seatKey(0, 0)]: students[1].id,
      [seatKey(0, 1)]: null,
      [seatKey(0, 2)]: null,
      [seatKey(0, 3)]: students[0].id,
    })
    const current = makePlan('current', classroom, olderRepeat.assignments)

    const latestThree = updatePlanAssignments({
      plan: current,
      assignments: current.assignments,
      students,
      classroom,
      separationRules: [],
      options: { ...DEFAULT_OPTIONS, historyDepth: 3 },
      history: [olderRepeat, recentA, recentB, recentC, current],
    })

    expect(latestThree.diagnostics.sameSeatRepeats).toBe(0)
    expect(latestThree.diagnostics.neighborRepeats).toBe(0)
    expect(latestThree.diagnostics.horizontalPairRepeats).toBe(0)

    const latestFour = updatePlanAssignments({
      plan: current,
      assignments: current.assignments,
      students,
      classroom,
      separationRules: [],
      options: { ...DEFAULT_OPTIONS, historyDepth: 4 },
      history: [olderRepeat, recentA, recentB, recentC, current],
    })

    expect(latestFour.diagnostics.sameSeatRepeats).toBe(2)
    expect(latestFour.diagnostics.neighborRepeats).toBe(1)
    expect(latestFour.diagnostics.horizontalPairRepeats).toBe(1)
  })
})

function makePlan(
  id: string,
  classroom: { rows: number; cols: number },
  assignments: Record<string, string | null>,
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
      separationViolations: 0,
      frontNeedFrontHalf: 0,
      frontNeedTotal: 0,
      tallBackHalf: 0,
      tallTotal: 0,
    },
  }
}
