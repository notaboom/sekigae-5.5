import {
  type AppState,
  type Classroom,
  type Gender,
  type PlanDiagnostics,
  type SeatingOptions,
  type SeatingPlan,
  type Student,
  DEFAULT_OPTIONS,
  DEFAULT_RECURRENCE_HISTORY_DEPTH,
  MAX_RECURRENCE_HISTORY_DEPTH,
  adjacencyPairs,
  availableSeatCount,
  buildSeatList,
  createInitialState,
  horizontalPairs,
  parseSeatKey,
} from './seating'

export const LEGACY_STORAGE_KEY = 'seat_shuffle_demo_v1'

type LegacyStudent = {
  id?: string
  name?: string
  gender?: string
  sex?: string
  vision?: string
  height?: string
  notes?: string
}

type LegacyPlan = {
  id?: string
  title?: string
  createdAt?: string
  rows?: number
  cols?: number
  grid?: Array<Array<string | null | undefined>>
  pairs?: string[]
  score?: number
}

type LegacyState = {
  students?: LegacyStudent[]
  rows?: number
  cols?: number
  blocked?: string[]
  fixedMap?: Record<string, string>
  history?: LegacyPlan[]
  current?: LegacyPlan | null
  options?: Partial<Record<string, number | boolean>>
}

export function migrateLegacyState(input: unknown): AppState | null {
  if (!isLegacyState(input)) return null

  const initial = createInitialState()
  const rows = clampNumber(input.rows, 1, 100, initial.classroom.rows)
  const cols = clampNumber(input.cols, 1, 100, initial.classroom.cols)
  const classroom: Classroom = {
    rows,
    cols,
    unavailableSeats: Array.isArray(input.blocked) ? input.blocked.filter((key) => isSeatInBounds(key, rows, cols)) : [],
    fixedAssignments: sanitizeLegacyFixedMap(input.fixedMap, rows, cols),
  }
  const students = (input.students ?? []).map(normalizeLegacyStudent).filter((student) => student.name.trim())
  const options = migrateLegacyOptions(input.options)
  const history = migrateLegacyHistory(input.history ?? [], classroom, students, options.historyDepth)
  const currentFromHistory = history.find((plan) => plan.id === input.current?.id)
  const currentPlan = currentFromHistory ?? migrateLegacyPlan(input.current ?? null, classroom, students, options.historyDepth, history, 'current')

  return {
    rosterMode: 'name',
    students,
    classroom,
    options,
    currentPlan: currentPlan ?? history.at(-1) ?? null,
    history: currentPlan && !history.some((plan) => plan.id === currentPlan.id) ? [...history, currentPlan] : history,
  }
}

function isLegacyState(input: unknown): input is LegacyState {
  if (!input || typeof input !== 'object') return false
  const candidate = input as LegacyState
  return (
    Array.isArray(candidate.students) ||
    Array.isArray(candidate.blocked) ||
    Boolean(candidate.fixedMap) ||
    Array.isArray(candidate.history) ||
    Boolean(candidate.current)
  )
}

function normalizeLegacyStudent(student: LegacyStudent): Student {
  const name = String(student.name ?? '').trim()
  const id = String(student.id || `legacy-${name || 'student'}-${Math.random().toString(16).slice(2, 8)}`)
  return {
    id,
    name,
    gender: normalizeLegacyGender(student.gender ?? student.sex ?? ''),
    vision: student.vision === 'poor' ? 'front' : 'standard',
    height: student.height === 'tall' ? 'back' : 'standard',
    note: String(student.notes ?? ''),
  }
}

function normalizeLegacyGender(value: string): Gender {
  if (['boy', 'boys', 'male', 'm', '男子', '男'].includes(value)) return 'boy'
  if (['girl', 'girls', 'female', 'f', '女子', '女'].includes(value)) return 'girl'
  return 'unspecified'
}

function migrateLegacyOptions(options: LegacyState['options']): SeatingOptions {
  return {
    ...DEFAULT_OPTIONS,
    trials: clampNumber(options?.trials, 20, 400, DEFAULT_OPTIONS.trials),
    improvementSteps: clampNumber(options?.hillSteps, 40, 600, DEFAULT_OPTIONS.improvementSteps),
    historyDepth: clampNumber(options?.historyWindow, 1, MAX_RECURRENCE_HISTORY_DEPTH, DEFAULT_OPTIONS.historyDepth),
    frontWeight: clampNumber(options?.visionWeight, 0, 10, DEFAULT_OPTIONS.frontWeight),
    heightWeight: clampNumber(options?.heightWeight, 0, 10, DEFAULT_OPTIONS.heightWeight),
    sameSeatPenalty: clampNumber(options?.sameSeatPenalty, 0, 20, DEFAULT_OPTIONS.sameSeatPenalty),
    neighborPenalty: clampNumber(options?.sameNeighborPenalty, 0, 20, DEFAULT_OPTIONS.neighborPenalty),
    visionClusterPenalty: clampNumber(options?.clusterPenalty, 0, 20, DEFAULT_OPTIONS.visionClusterPenalty),
    genderPairWeight: clampNumber(options?.genderMixWeight, 0, 10, DEFAULT_OPTIONS.genderPairWeight),
    preferGenderMix: typeof options?.preferMixedGender === 'boolean' ? options.preferMixedGender : DEFAULT_OPTIONS.preferGenderMix,
  }
}

function migrateLegacyHistory(
  legacyHistory: LegacyPlan[],
  classroom: Classroom,
  students: Student[],
  historyDepth: number,
): SeatingPlan[] {
  const migrated: SeatingPlan[] = []
  legacyHistory.forEach((plan, index) => {
    const next = migrateLegacyPlan(plan, classroom, students, historyDepth, migrated, `history-${index}`)
    if (next) migrated.push(next)
  })
  return migrated
}

function migrateLegacyPlan(
  legacyPlan: LegacyPlan | null,
  classroom: Classroom,
  students: Student[],
  historyDepth: number,
  previousPlans: SeatingPlan[],
  fallbackId: string,
): SeatingPlan | null {
  if (!legacyPlan?.grid) return null
  const rows = clampNumber(legacyPlan.rows, 1, 100, classroom.rows)
  const cols = clampNumber(legacyPlan.cols, 1, 100, classroom.cols)
  const planClassroom = { ...classroom, rows, cols }
  const assignments = gridToAssignments(legacyPlan.grid, planClassroom)
  const pairs = adjacencyPairs(assignments, planClassroom)
  const leftRightPairs = horizontalPairs(assignments, planClassroom)

  return {
    id: String(legacyPlan.id || `legacy-${fallbackId}`),
    title: String(legacyPlan.title || '旧版から移行した席替え'),
    createdAt: String(legacyPlan.createdAt || new Date().toISOString()),
    rows,
    cols,
    score: Number.isFinite(legacyPlan.score) ? Number(legacyPlan.score) : 0,
    seed: 0,
    assignments,
    pairs,
    horizontalPairs: leftRightPairs,
    diagnostics: buildDiagnostics(assignments, planClassroom, students, previousPlans, historyDepth),
  }
}

function gridToAssignments(grid: LegacyPlan['grid'], classroom: Pick<Classroom, 'rows' | 'cols'>): Record<string, string | null> {
  const assignments: Record<string, string | null> = {}
  buildSeatList(classroom).forEach((key) => {
    const [row, col] = parseSeatKey(key)
    assignments[key] = grid?.[row]?.[col] || null
  })
  return assignments
}

function buildDiagnostics(
  assignments: Record<string, string | null>,
  classroom: Classroom,
  students: Student[],
  previousPlans: SeatingPlan[],
  historyDepth: number,
): PlanDiagnostics {
  const studentsById = new Map(students.map((student) => [student.id, student]))
  const recurrenceDepth = Number.isFinite(historyDepth)
    ? Math.max(1, Math.min(MAX_RECURRENCE_HISTORY_DEPTH, Math.round(historyDepth)))
    : DEFAULT_RECURRENCE_HISTORY_DEPTH
  const recent = previousPlans.slice(-recurrenceDepth)
  const previousSeats = new Map<string, Set<string>>()
  const previousPairs = new Set<string>()
  const previousHorizontal = new Set<string>()

  recent.forEach((plan) => {
    Object.entries(plan.assignments).forEach(([key, studentId]) => {
      if (!studentId) return
      if (!previousSeats.has(studentId)) previousSeats.set(studentId, new Set())
      previousSeats.get(studentId)?.add(key)
    })
    plan.pairs.forEach((pair) => previousPairs.add(pair))
    plan.horizontalPairs.forEach((pair) => previousHorizontal.add(pair))
  })

  const pairs = adjacencyPairs(assignments, classroom)
  const leftRightPairs = horizontalPairs(assignments, classroom)
  let frontNeedFrontHalf = 0
  let frontNeedTotal = 0
  let tallBackHalf = 0
  let tallTotal = 0
  let sameSeatRepeats = 0

  Object.entries(assignments).forEach(([key, studentId]) => {
    if (!studentId) return
    const student = studentsById.get(studentId)
    if (!student) return
    const [row] = parseSeatKey(key)
    if (student.vision === 'front') {
      frontNeedTotal += 1
      if (row < Math.ceil(classroom.rows / 2)) frontNeedFrontHalf += 1
    }
    if (student.height === 'back') {
      tallTotal += 1
      if (row >= Math.floor(classroom.rows / 2)) tallBackHalf += 1
    }
    if (previousSeats.get(studentId)?.has(key)) sameSeatRepeats += 1
  })

  return {
    placedStudents: Object.values(assignments).filter(Boolean).length,
    openSeats: availableSeatCount(classroom),
    emptySeats: Object.values(assignments).filter((value) => value === null).length,
    sameSeatRepeats,
    neighborRepeats: pairs.filter((pair) => previousPairs.has(pair)).length,
    horizontalPairRepeats: leftRightPairs.filter((pair) => previousHorizontal.has(pair)).length,
    frontNeedFrontHalf,
    frontNeedTotal,
    tallBackHalf,
    tallTotal,
  }
}

function sanitizeLegacyFixedMap(fixedMap: LegacyState['fixedMap'], rows: number, cols: number): Record<string, string> {
  if (!fixedMap) return {}
  return Object.fromEntries(Object.entries(fixedMap).filter(([key, studentId]) => studentId && isSeatInBounds(key, rows, cols)))
}

function isSeatInBounds(key: string, rows: number, cols: number): boolean {
  const [row, col] = parseSeatKey(key)
  return row >= 0 && row < rows && col >= 0 && col < cols
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}
