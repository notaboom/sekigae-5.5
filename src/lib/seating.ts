export type Gender = 'boy' | 'girl' | 'unspecified'
export type VisionNeed = 'standard' | 'front'
export type HeightNeed = 'standard' | 'back'
export type RosterMode = 'attendance' | 'name'

export type Student = {
  id: string
  name: string
  attendanceNumber?: number
  gender: Gender
  vision: VisionNeed
  height: HeightNeed
  note: string
}

export type Classroom = {
  rows: number
  cols: number
  unavailableSeats: string[]
  fixedAssignments: Record<string, string>
}

export type SeatingOptions = {
  trials: number
  improvementSteps: number
  historyDepth: number
  frontWeight: number
  heightWeight: number
  sameSeatPenalty: number
  neighborPenalty: number
  visionClusterPenalty: number
  genderPairWeight: number
  preferGenderMix: boolean
}

export type SeatingPlan = {
  id: string
  title: string
  createdAt: string
  rows: number
  cols: number
  score: number
  seed: number
  assignments: Record<string, string | null>
  pairs: string[]
  horizontalPairs: string[]
  diagnostics: PlanDiagnostics
}

export type PlanDiagnostics = {
  placedStudents: number
  openSeats: number
  emptySeats: number
  sameSeatRepeats: number
  neighborRepeats: number
  horizontalPairRepeats: number
  frontNeedFrontHalf: number
  frontNeedTotal: number
  tallBackHalf: number
  tallTotal: number
}

export type AppState = {
  rosterMode: RosterMode
  students: Student[]
  classroom: Classroom
  options: SeatingOptions
  currentPlan: SeatingPlan | null
  history: SeatingPlan[]
}

export type GenerateResult =
  | { ok: true; plan: SeatingPlan }
  | { ok: false; error: string }

export const STORAGE_KEY = 'sekigae_55_workspace_v1'
export const RECURRENCE_HISTORY_DEPTH = 3

export const DEFAULT_OPTIONS: SeatingOptions = {
  trials: 120,
  improvementSteps: 180,
  historyDepth: RECURRENCE_HISTORY_DEPTH,
  frontWeight: 4,
  heightWeight: 2,
  sameSeatPenalty: 9,
  neighborPenalty: 7,
  visionClusterPenalty: 3,
  genderPairWeight: 2,
  preferGenderMix: false,
}

export const DEFAULT_CLASSROOM: Classroom = {
  rows: 5,
  cols: 6,
  unavailableSeats: [],
  fixedAssignments: {},
}

export const DEFAULT_STUDENTS: Student[] = createAttendanceStudents(availableSeatCount(DEFAULT_CLASSROOM))

export function createInitialState(): AppState {
  return {
    rosterMode: 'attendance',
    students: DEFAULT_STUDENTS,
    classroom: DEFAULT_CLASSROOM,
    options: DEFAULT_OPTIONS,
    currentPlan: null,
    history: [],
  }
}

export function createAttendanceStudents(count: number, existing: Student[] = []): Student[] {
  const byNumber = new Map(existing.map((student) => [student.attendanceNumber, student]))
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const attendanceNumber = index + 1
    const existingStudent = byNumber.get(attendanceNumber)
    if (existingStudent) {
      return {
        ...existingStudent,
        name: String(attendanceNumber),
        attendanceNumber,
        gender: existingStudent.gender === 'unspecified' ? 'boy' : existingStudent.gender,
      }
    }
    return makeStudent(String(attendanceNumber), 'boy', 'standard', 'standard', '', attendanceNumber)
  })
}

export function makeStudent(
  name: string,
  gender: Gender = 'unspecified',
  vision: VisionNeed = 'standard',
  height: HeightNeed = 'standard',
  note = '',
  attendanceNumber?: number,
): Student {
  return {
    id: makeId(name || 'student'),
    name,
    attendanceNumber,
    gender,
    vision,
    height,
    note,
  }
}

export function makeId(source: string): string {
  const base = source
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ン一-龥ー]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || 'student'}-${Math.random().toString(16).slice(2, 8)}`
}

export function seatKey(row: number, col: number): string {
  return `${row}-${col}`
}

export function parseSeatKey(key: string): [number, number] {
  const [row, col] = key.split('-').map((part) => Number(part))
  return [Number.isFinite(row) ? row : 0, Number.isFinite(col) ? col : 0]
}

export function normalizeGender(raw: string): Gender {
  const value = raw.trim().toLowerCase()
  if (['boy', 'boys', 'male', 'm', '男子', '男', '男の子'].includes(value)) return 'boy'
  if (['girl', 'girls', 'female', 'f', '女子', '女', '女の子'].includes(value)) return 'girl'
  return 'unspecified'
}

export function normalizeVision(raw: string): VisionNeed {
  const value = raw.trim().toLowerCase()
  if (['front', 'poor', 'low', '前', '前方', '視力', '配慮', '見えにくい'].some((token) => value.includes(token))) {
    return 'front'
  }
  return 'standard'
}

export function normalizeHeight(raw: string): HeightNeed {
  const value = raw.trim().toLowerCase()
  if (['back', 'tall', 'high', '後', '後方', '高い', '背が高い'].some((token) => value.includes(token))) {
    return 'back'
  }
  return 'standard'
}

export function parseRosterText(text: string): Student[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
    .filter((columns) => columns[0] && !['name', '名前', '氏名'].includes(columns[0].toLowerCase()))
    .map((columns) => {
      const gender = normalizeGender(columns[1] ?? '')
      const secondColumnIsGender = gender !== 'unspecified'
      if (secondColumnIsGender) {
        return makeStudent(
          columns[0],
          gender,
          normalizeVision(columns[2] ?? ''),
          normalizeHeight(columns[3] ?? ''),
          columns.slice(4).join(' '),
        )
      }
      return makeStudent(
        columns[0],
        'unspecified',
        normalizeVision(columns[1] ?? ''),
        normalizeHeight(columns[2] ?? ''),
        columns.slice(3).join(' '),
      )
    })
}

export function availableSeatCount(classroom: Classroom): number {
  return buildSeatList(classroom).length - classroom.unavailableSeats.length
}

export function updatePlanAssignments(input: {
  plan: SeatingPlan
  assignments: Record<string, string | null>
  students: Student[]
  classroom: Classroom
  options: SeatingOptions
  history: SeatingPlan[]
}): SeatingPlan {
  const students = input.students.filter((student) => student.name.trim())
  const studentsById = new Map(students.map((student) => [student.id, student]))
  const past = buildHistoryIndex(
    input.history.filter((plan) => plan.id !== input.plan.id),
    input.options.historyDepth,
  )
  const evaluation = scoreAssignments(input.assignments, studentsById, input.classroom, input.options, past)
  return {
    ...input.plan,
    title: input.plan.title.includes('手動調整') ? input.plan.title : `${input.plan.title}（手動調整）`,
    score: evaluation.score,
    assignments: { ...input.assignments },
    pairs: adjacencyPairs(input.assignments, input.classroom),
    horizontalPairs: horizontalPairs(input.assignments, input.classroom),
    diagnostics: {
      ...evaluation.diagnostics,
      placedStudents: Object.values(input.assignments).filter(Boolean).length,
      openSeats: availableSeatCount(input.classroom),
      emptySeats: Object.values(input.assignments).filter((value) => value === null).length,
    },
  }
}

export function generateSeatingPlan(input: {
  students: Student[]
  classroom: Classroom
  options: SeatingOptions
  history: SeatingPlan[]
  seed?: number
}): GenerateResult {
  const students = input.students.filter((student) => student.name.trim())
  const studentIds = new Set(students.map((student) => student.id))
  const unavailable = new Set(input.classroom.unavailableSeats)
  const fixed = sanitizeFixedAssignments(input.classroom.fixedAssignments, studentIds, unavailable)
  const seats = buildSeatList(input.classroom)
  const openSeats = seats.filter((key) => !unavailable.has(key))
  const capacity = openSeats.length

  if (students.length === 0) {
    return { ok: false, error: '名簿に児童を追加してください。' }
  }

  if (capacity < students.length) {
    return {
      ok: false,
      error: `使える席が足りません。児童 ${students.length}人に対して、利用可能な席は ${capacity}席です。`,
    }
  }

  const fixedStudentIds = new Set(Object.values(fixed))
  const movableStudents = students.filter((student) => !fixedStudentIds.has(student.id))
  const movableSeats = openSeats.filter((key) => !fixed[key])
  const rng = createRng(input.seed ?? Date.now())
  const past = buildHistoryIndex(input.history, input.options.historyDepth)
  const studentsById = new Map(students.map((student) => [student.id, student]))
  let best: SeatingPlan | null = null

  for (let trial = 0; trial < input.options.trials; trial += 1) {
    const assignments = buildEmptyAssignments(seats, fixed, unavailable)
    const shuffledSeats = shuffle(movableSeats, rng).sort((a, b) => seatSortForStudent(a, b))
    const orderedStudents = buildStudentOrder(movableStudents, input.options, rng)

    orderedStudents.forEach((student, index) => {
      const key = shuffledSeats[index]
      if (key) assignments[key] = student.id
    })

    const swappableSeats = movableSeats.slice()
    let currentScore = scoreAssignments(assignments, studentsById, input.classroom, input.options, past).score

    for (let step = 0; step < input.options.improvementSteps; step += 1) {
      const left = Math.floor(rng() * swappableSeats.length)
      const right = Math.floor(rng() * swappableSeats.length)
      if (left === right) continue

      const leftKey = swappableSeats[left]
      const rightKey = swappableSeats[right]
      const before = assignments[leftKey]
      assignments[leftKey] = assignments[rightKey]
      assignments[rightKey] = before

      const nextScore = scoreAssignments(assignments, studentsById, input.classroom, input.options, past).score
      if (nextScore >= currentScore) {
        currentScore = nextScore
      } else {
        const rollback = assignments[leftKey]
        assignments[leftKey] = assignments[rightKey]
        assignments[rightKey] = rollback
      }
    }

    const evaluation = scoreAssignments(assignments, studentsById, input.classroom, input.options, past)
    const plan = makePlan(assignments, evaluation, input.classroom, input.seed ?? Date.now(), students.length)
    if (!best || plan.score > best.score) best = plan
  }

  if (!best) return { ok: false, error: '席替えを生成できませんでした。条件を少しゆるめてください。' }
  return { ok: true, plan: best }
}

export function sanitizeFixedAssignments(
  fixedAssignments: Record<string, string>,
  studentIds: Set<string>,
  unavailable: Set<string>,
): Record<string, string> {
  const next: Record<string, string> = {}
  const usedStudents = new Set<string>()
  Object.entries(fixedAssignments).forEach(([key, studentId]) => {
    if (!studentId || !studentIds.has(studentId) || unavailable.has(key) || usedStudents.has(studentId)) return
    next[key] = studentId
    usedStudents.add(studentId)
  })
  return next
}

export function buildSeatList(classroom: Pick<Classroom, 'rows' | 'cols'>): string[] {
  const seats: string[] = []
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) seats.push(seatKey(row, col))
  }
  return seats
}

export function toGrid<T>(
  classroom: Pick<Classroom, 'rows' | 'cols'>,
  getValue: (key: string, row: number, col: number) => T,
): T[][] {
  return Array.from({ length: classroom.rows }, (_, row) =>
    Array.from({ length: classroom.cols }, (_, col) => getValue(seatKey(row, col), row, col)),
  )
}

export function adjacencyPairs(assignments: Record<string, string | null>, classroom: Pick<Classroom, 'rows' | 'cols'>): string[] {
  const pairs = new Set<string>()
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) {
      addPair(pairs, assignments[seatKey(row, col)], assignments[seatKey(row + 1, col)])
      addPair(pairs, assignments[seatKey(row, col)], assignments[seatKey(row, col + 1)])
    }
  }
  return Array.from(pairs)
}

export function horizontalPairs(
  assignments: Record<string, string | null>,
  classroom: Pick<Classroom, 'rows' | 'cols'>,
): string[] {
  const pairs = new Set<string>()
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols - 1; col += 1) {
      addPair(pairs, assignments[seatKey(row, col)], assignments[seatKey(row, col + 1)])
    }
  }
  return Array.from(pairs)
}

export function exportRosterCsv(students: Student[]): string {
  const header = ['名前', '性別', '視力配慮', '身長配慮', 'メモ']
  const rows = students.map((student) => [
    student.name,
    genderLabel(student.gender),
    student.vision === 'front' ? '前方' : '標準',
    student.height === 'back' ? '後方' : '標準',
    student.note,
  ])
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

export function genderLabel(gender: Gender): string {
  if (gender === 'boy') return '男子'
  if (gender === 'girl') return '女子'
  return '指定なし'
}

export function studentCareLabel(student: Student): string {
  const labels: string[] = []
  if (student.vision === 'front') labels.push('前方')
  if (student.height === 'back') labels.push('後方')
  if (student.note) labels.push(student.note)
  return labels.join(' / ')
}

function makePlan(
  assignments: Record<string, string | null>,
  evaluation: { score: number; diagnostics: PlanDiagnostics },
  classroom: Classroom,
  seed: number,
  studentCount: number,
): SeatingPlan {
  const createdAt = new Date().toISOString()
  return {
    id: `plan-${createdAt}-${Math.random().toString(16).slice(2, 8)}`,
    title: `${new Date(createdAt).toLocaleString('ja-JP')} の席替え`,
    createdAt,
    rows: classroom.rows,
    cols: classroom.cols,
    score: evaluation.score,
    seed,
    assignments: { ...assignments },
    pairs: adjacencyPairs(assignments, classroom),
    horizontalPairs: horizontalPairs(assignments, classroom),
    diagnostics: {
      ...evaluation.diagnostics,
      placedStudents: studentCount,
      openSeats: buildSeatList(classroom).length - classroom.unavailableSeats.length,
      emptySeats: Object.values(assignments).filter((value) => value === null).length,
    },
  }
}

function buildEmptyAssignments(
  seats: string[],
  fixedAssignments: Record<string, string>,
  unavailable: Set<string>,
): Record<string, string | null> {
  const assignments: Record<string, string | null> = {}
  seats.forEach((key) => {
    assignments[key] = unavailable.has(key) ? null : (fixedAssignments[key] ?? null)
  })
  return assignments
}

function buildHistoryIndex(history: SeatingPlan[], historyDepth: number) {
  const recent = history.slice(-clampHistoryDepth(historyDepth))
  const seatByStudent = new Map<string, Set<string>>()
  const neighborPairs = new Set<string>()
  const leftRightPairs = new Set<string>()

  recent.forEach((plan) => {
    Object.entries(plan.assignments).forEach(([key, studentId]) => {
      if (!studentId) return
      if (!seatByStudent.has(studentId)) seatByStudent.set(studentId, new Set())
      seatByStudent.get(studentId)?.add(key)
    })
    plan.pairs.forEach((pair) => neighborPairs.add(pair))
    plan.horizontalPairs.forEach((pair) => leftRightPairs.add(pair))
  })

  return { seatByStudent, neighborPairs, leftRightPairs }
}

function clampHistoryDepth(historyDepth: number): number {
  if (!Number.isFinite(historyDepth)) return RECURRENCE_HISTORY_DEPTH
  return Math.max(1, Math.min(RECURRENCE_HISTORY_DEPTH, Math.round(historyDepth)))
}

function scoreAssignments(
  assignments: Record<string, string | null>,
  studentsById: Map<string, Student>,
  classroom: Classroom,
  options: SeatingOptions,
  past: ReturnType<typeof buildHistoryIndex>,
): { score: number; diagnostics: PlanDiagnostics } {
  let score = 0
  let sameSeatRepeats = 0
  let frontNeedFrontHalf = 0
  let frontNeedTotal = 0
  let tallBackHalf = 0
  let tallTotal = 0

  Object.entries(assignments).forEach(([key, studentId]) => {
    if (!studentId) return
    const student = studentsById.get(studentId)
    if (!student) return
    const [row] = parseSeatKey(key)

    if (student.vision === 'front') {
      frontNeedTotal += 1
      if (row < Math.ceil(classroom.rows / 2)) frontNeedFrontHalf += 1
      score += options.frontWeight * (classroom.rows - row)
    }

    if (student.height === 'back') {
      tallTotal += 1
      if (row >= Math.floor(classroom.rows / 2)) tallBackHalf += 1
      score += options.heightWeight * row
    }

    if (past.seatByStudent.get(studentId)?.has(key)) {
      sameSeatRepeats += 1
      score -= options.sameSeatPenalty
    }
  })

  const pairs = adjacencyPairs(assignments, classroom)
  const horizontal = horizontalPairs(assignments, classroom)
  const neighborRepeats = pairs.filter((pair) => past.neighborPairs.has(pair)).length
  const horizontalPairRepeats = horizontal.filter((pair) => past.leftRightPairs.has(pair)).length
  score -= neighborRepeats * options.neighborPenalty

  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) {
      const student = studentsById.get(assignments[seatKey(row, col)] ?? '')
      if (!student || student.vision !== 'front') continue
      const right = studentsById.get(assignments[seatKey(row, col + 1)] ?? '')
      const down = studentsById.get(assignments[seatKey(row + 1, col)] ?? '')
      if (right?.vision === 'front') score -= options.visionClusterPenalty
      if (down?.vision === 'front') score -= options.visionClusterPenalty
    }
  }

  if (options.preferGenderMix && options.genderPairWeight > 0) {
    for (let row = 0; row < classroom.rows; row += 1) {
      for (let col = 0; col < classroom.cols; col += 2) {
        const left = studentsById.get(assignments[seatKey(row, col)] ?? '')
        const right = studentsById.get(assignments[seatKey(row, col + 1)] ?? '')
        if (!left || !right || left.gender === 'unspecified' || right.gender === 'unspecified') continue
        score += left.gender === right.gender ? -options.genderPairWeight : options.genderPairWeight * 0.25
      }
    }
  }

  return {
    score,
    diagnostics: {
      placedStudents: 0,
      openSeats: 0,
      emptySeats: 0,
      sameSeatRepeats,
      neighborRepeats,
      horizontalPairRepeats,
      frontNeedFrontHalf,
      frontNeedTotal,
      tallBackHalf,
      tallTotal,
    },
  }
}

function buildStudentOrder(students: Student[], options: SeatingOptions, rng: () => number): Student[] {
  const front = students.filter((student) => student.vision === 'front')
  const standard = students.filter((student) => student.vision !== 'front')
  if (!options.preferGenderMix) return [...shuffle(front, rng), ...shuffle(standard, rng)]
  return [...interleaveGender(front, rng), ...interleaveGender(standard, rng)]
}

function interleaveGender(students: Student[], rng: () => number): Student[] {
  const boys = shuffle(
    students.filter((student) => student.gender === 'boy'),
    rng,
  )
  const girls = shuffle(
    students.filter((student) => student.gender === 'girl'),
    rng,
  )
  const unspecified = shuffle(
    students.filter((student) => student.gender === 'unspecified'),
    rng,
  )
  const result: Student[] = []
  const max = Math.max(boys.length, girls.length)
  const boysFirst = boys.length >= girls.length
  for (let index = 0; index < max; index += 1) {
    const first = boysFirst ? boys[index] : girls[index]
    const second = boysFirst ? girls[index] : boys[index]
    if (first) result.push(first)
    if (second) result.push(second)
  }
  return [...result, ...unspecified]
}

function seatSortForStudent(leftKey: string, rightKey: string): number {
  const [leftRow, leftCol] = parseSeatKey(leftKey)
  const [rightRow, rightCol] = parseSeatKey(rightKey)
  if (leftRow !== rightRow) return leftRow - rightRow
  return leftCol - rightCol
}

function addPair(pairs: Set<string>, left?: string | null, right?: string | null): void {
  if (!left || !right || left === right) return
  pairs.add(left < right ? `${left}|${right}` : `${right}|${left}`)
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const next = items.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const current = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = current
  }
  return next
}

function createRng(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function escapeCsvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}
