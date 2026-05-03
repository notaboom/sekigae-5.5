import {
  Download,
  FileDown,
  FileText,
  FileUp,
  History,
  Lock,
  Printer,
  RotateCcw,
  Save,
  Shuffle,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  type AppState,
  type Classroom,
  type ClassroomTemplate,
  type Gender,
  type HeightNeed,
  type MigrationAudit,
  type RosterMode,
  type SeatingOptions,
  type SeatingPlan,
  type SeparationRule,
  type Student,
  type VisionNeed,
  DEFAULT_RECURRENCE_HISTORY_DEPTH,
  DEFAULT_OPTIONS,
  MAX_RECURRENCE_HISTORY_DEPTH,
  RECURRENCE_HISTORY_DEPTH_OPTIONS,
  STORAGE_KEY,
  availableSeatCount,
  buildSeatList,
  createAttendanceStudents,
  createInitialState,
  exportRosterCsv,
  genderLabel,
  generateSeatingPlan,
  makeStudent,
  parseRosterText,
  parseSeatKey,
  sanitizeFixedAssignments,
  seatKey,
  studentCareLabel,
  studentPairKey,
  updatePlanAssignments,
} from './lib/seating'
import { LEGACY_STORAGE_KEY, migrateLegacyState } from './lib/legacyMigration'

const HISTORY_LIMIT = 24
const CLASSROOM_SIZE_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1)

type StudentDraft = {
  name: string
  gender: Gender
  vision: VisionNeed
  height: HeightNeed
  note: string
}

type ComparisonTone = 'good' | 'bad' | 'neutral'

type ComparisonRow = {
  label: string
  previous: string
  current: string
  delta: string
  tone: ComparisonTone
}

type AlertKind = 'same-seat' | 'neighbor' | 'horizontal' | 'separation' | 'empty' | 'not-generated'

type AlertItem = {
  id: string
  kind: AlertKind
  label: string
  seats: string[]
}

type SeparationDraft = {
  leftStudentId: string
  rightStudentId: string
  note: string
}

type AlertDetail = {
  alertId: string
  title: string
  lines: string[]
}

type StudentReason = {
  studentId: string
  label: string
  seat: string
  reasons: string[]
}

const emptyDraft: StudentDraft = {
  name: '',
  gender: 'boy',
  vision: 'standard',
  height: 'standard',
  note: '',
}

const emptySeparationDraft: SeparationDraft = {
  leftStudentId: '',
  rightStudentId: '',
  note: '',
}

function App() {
  const [initialLoad] = useState(() => loadState())
  const [state, setState] = useState<AppState>(initialLoad.state)
  const [draft, setDraft] = useState<StudentDraft>(emptyDraft)
  const [separationDraft, setSeparationDraft] = useState<SeparationDraft>(emptySeparationDraft)
  const [templateName, setTemplateName] = useState('')
  const [importText, setImportText] = useState('')
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [swapTargetSeat, setSwapTargetSeat] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null)
  const [message, setMessage] = useState(initialLoad.migratedLegacy ? '旧版データを引き継ぎました' : '準備完了')
  const importFileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const seats = useMemo(() => buildSeatList(state.classroom), [state.classroom])
  const unavailable = useMemo(() => new Set(state.classroom.unavailableSeats), [state.classroom.unavailableSeats])
  const studentsById = useMemo(() => new Map(state.students.map((student) => [student.id, student])), [state.students])
  const previousPlan = useMemo(() => findPreviousPlan(state.currentPlan, state.history), [state.currentPlan, state.history])
  const previousHorizontalPairs = useMemo(() => new Set(previousPlan?.horizontalPairs ?? []), [previousPlan])
  const alerts = useMemo(
    () => buildAlerts(state.currentPlan, state.history, state.options.historyDepth, state.classroom, state.separationRules),
    [state.currentPlan, state.history, state.options.historyDepth, state.classroom, state.separationRules],
  )
  const alertSeatMap = useMemo(() => buildAlertSeatMap(alerts), [alerts])
  const alertDetails = useMemo(
    () =>
      buildAlertDetails(
        state.currentPlan,
        state.history,
        state.options.historyDepth,
        state.classroom,
        state.separationRules,
        studentsById,
      ),
    [state.currentPlan, state.history, state.options.historyDepth, state.classroom, state.separationRules, studentsById],
  )
  const studentReasons = useMemo(
    () =>
      buildStudentReasons(
        state.currentPlan,
        state.history,
        state.options.historyDepth,
        state.classroom,
        state.separationRules,
        studentsById,
        state.rosterMode,
      ),
    [state.currentPlan, state.history, state.options.historyDepth, state.classroom, state.separationRules, studentsById, state.rosterMode],
  )
  const selectedFixedStudent = selectedSeat ? state.classroom.fixedAssignments[selectedSeat] : ''
  const selectedSeatLabel = selectedSeat ? seatLabel(selectedSeat) : '未選択'
  const selectedSeatLocked = selectedSeat ? Boolean(state.classroom.fixedAssignments[selectedSeat]) : false
  const swapSeatOptions = selectedSeat
    ? seats.filter(
        (key) =>
          key !== selectedSeat &&
          !unavailable.has(key) &&
          !state.classroom.fixedAssignments[key],
      )
    : []

  const openSeatCount = seats.length - state.classroom.unavailableSeats.length
  const fixedCount = Object.keys(state.classroom.fixedAssignments).length
  const capacityOk = openSeatCount >= state.students.length

  function setClassroomSize(field: 'rows' | 'cols', value: number) {
    setState((current) => {
      const classroom = { ...current.classroom, [field]: clamp(value, 1, 100) }
      const validSeats = new Set(buildSeatList(classroom))
      const unavailableSeats = classroom.unavailableSeats.filter((key) => validSeats.has(key))
      const fixedAssignments = Object.fromEntries(
        Object.entries(classroom.fixedAssignments).filter(([key]) => validSeats.has(key)),
      )
      const nextClassroom = {
        ...classroom,
        unavailableSeats,
        fixedAssignments,
      }
      const students =
        current.rosterMode === 'attendance'
          ? createAttendanceStudents(availableSeatCount(nextClassroom), current.students)
          : current.students
      return {
        ...current,
        students,
        classroom: {
          ...nextClassroom,
          fixedAssignments: sanitizeFixedAssignments(
            nextClassroom.fixedAssignments,
            new Set(students.map((student) => student.id)),
            new Set(nextClassroom.unavailableSeats),
          ),
        },
        currentPlan: null,
      }
    })
  }

  function setRosterMode(rosterMode: RosterMode) {
    setState((current) => {
      if (current.rosterMode === rosterMode) return current
      const students =
        rosterMode === 'attendance'
          ? createAttendanceStudents(availableSeatCount(current.classroom), current.students)
          : current.students
      return {
        ...current,
        rosterMode,
        students,
        classroom: {
          ...current.classroom,
          fixedAssignments: sanitizeFixedAssignments(
            current.classroom.fixedAssignments,
            new Set(students.map((student) => student.id)),
            new Set(current.classroom.unavailableSeats),
          ),
        },
        currentPlan: null,
        history: [],
      }
    })
    setMessage(rosterMode === 'attendance' ? '出席番号方式に切り替えました' : '名前方式に切り替えました')
  }

  function addStudent() {
    if (!draft.name.trim()) return
    setState((current) => ({
      ...current,
      students: [...current.students, makeStudent(draft.name.trim(), draft.gender, draft.vision, draft.height, draft.note.trim())],
    }))
    setDraft(emptyDraft)
    setMessage('児童を追加しました')
  }

  function updateStudent(id: string, patch: Partial<Student>) {
    setState((current) => ({
      ...current,
      students: current.students.map((student) => (student.id === id ? { ...student, ...patch } : student)),
    }))
  }

  function removeStudent(id: string) {
    setState((current) => {
      const fixedAssignments = Object.fromEntries(
        Object.entries(current.classroom.fixedAssignments).filter(([, studentId]) => studentId !== id),
      )
      return {
        ...current,
        students: current.students.filter((student) => student.id !== id),
        classroom: { ...current.classroom, fixedAssignments },
        separationRules: current.separationRules.filter((rule) => rule.leftStudentId !== id && rule.rightStudentId !== id),
      }
    })
    setMessage('児童を削除しました')
  }

  function importRoster() {
    const imported = parseRosterText(importText)
    if (imported.length === 0) {
      setMessage('読み込める行がありません')
      return
    }
    setState((current) => ({ ...current, students: [...current.students, ...imported] }))
    setImportText('')
    setMessage(`${imported.length}人を読み込みました`)
  }

  function toggleUnavailable(key: string) {
    setState((current) => {
      const unavailableSeats = new Set(current.classroom.unavailableSeats)
      const fixedAssignments = { ...current.classroom.fixedAssignments }
      if (unavailableSeats.has(key)) {
        unavailableSeats.delete(key)
      } else {
        unavailableSeats.add(key)
        delete fixedAssignments[key]
      }
      const classroom = {
        ...current.classroom,
        unavailableSeats: Array.from(unavailableSeats),
        fixedAssignments,
      }
      const students =
        current.rosterMode === 'attendance'
          ? createAttendanceStudents(availableSeatCount(classroom), current.students)
          : current.students
      return {
        ...current,
        students,
        classroom: {
          ...classroom,
          fixedAssignments: sanitizeFixedAssignments(
            fixedAssignments,
            new Set(students.map((student) => student.id)),
            unavailableSeats,
          ),
        },
        currentPlan: null,
      }
    })
  }

  function setFixedSeat(key: string, studentId: string) {
    setState((current) => {
      const fixedAssignments = { ...current.classroom.fixedAssignments }
      Object.entries(fixedAssignments).forEach(([seat, fixedStudentId]) => {
        if (fixedStudentId === studentId) delete fixedAssignments[seat]
      })
      if (studentId) fixedAssignments[key] = studentId
      else delete fixedAssignments[key]
      return {
        ...current,
        classroom: {
          ...current.classroom,
          fixedAssignments: sanitizeFixedAssignments(
            fixedAssignments,
            new Set(current.students.map((student) => student.id)),
            new Set(current.classroom.unavailableSeats),
          ),
        },
      }
    })
  }

  function updateOptions(patch: Partial<SeatingOptions>) {
    setState((current) => ({ ...current, options: { ...current.options, ...patch } }))
  }

  function saveClassroomTemplate() {
    const name = templateName.trim() || `${state.classroom.rows}x${state.classroom.cols} 教室`
    const template: ClassroomTemplate = {
      id: makeLocalId('template'),
      name,
      classroom: cloneClassroom(state.classroom),
    }
    setState((current) => ({ ...current, classroomTemplates: [...current.classroomTemplates, template].slice(-12) }))
    setTemplateName('')
    setMessage('教室テンプレートを保存しました')
  }

  function applyClassroomTemplate(templateId: string) {
    const template = state.classroomTemplates.find((item) => item.id === templateId)
    if (!template) return
    setState((current) => {
      const classroom = cloneClassroom(template.classroom)
      const students =
        current.rosterMode === 'attendance'
          ? createAttendanceStudents(availableSeatCount(classroom), current.students)
          : current.students
      return {
        ...current,
        students,
        classroom: {
          ...classroom,
          fixedAssignments: sanitizeFixedAssignments(
            classroom.fixedAssignments,
            new Set(students.map((student) => student.id)),
            new Set(classroom.unavailableSeats),
          ),
        },
        currentPlan: null,
      }
    })
    setSelectedSeat(null)
    setMessage(`${template.name}を適用しました`)
  }

  function deleteClassroomTemplate(templateId: string) {
    setState((current) => ({
      ...current,
      classroomTemplates: current.classroomTemplates.filter((template) => template.id !== templateId),
    }))
    setMessage('教室テンプレートを削除しました')
  }

  function addSeparationRule() {
    if (!separationDraft.leftStudentId || !separationDraft.rightStudentId) {
      setMessage('離す児童を2人選んでください')
      return
    }
    if (separationDraft.leftStudentId === separationDraft.rightStudentId) {
      setMessage('同じ児童は選べません')
      return
    }
    const pair = studentPairKey(separationDraft.leftStudentId, separationDraft.rightStudentId)
    if (state.separationRules.some((rule) => studentPairKey(rule.leftStudentId, rule.rightStudentId) === pair)) {
      setMessage('同じ離すルールがすでにあります')
      return
    }
    setState((current) => ({
      ...current,
      separationRules: [
        ...current.separationRules,
        {
          id: makeLocalId('separate'),
          leftStudentId: separationDraft.leftStudentId,
          rightStudentId: separationDraft.rightStudentId,
          note: separationDraft.note.trim(),
        },
      ],
    }))
    setSeparationDraft(emptySeparationDraft)
    setMessage('離すルールを追加しました')
  }

  function deleteSeparationRule(ruleId: string) {
    setState((current) => ({
      ...current,
      separationRules: current.separationRules.filter((rule) => rule.id !== ruleId),
    }))
    setMessage('離すルールを削除しました')
  }

  function generate() {
    const result = generateSeatingPlan({
      students: state.students,
      classroom: state.classroom,
      separationRules: state.separationRules,
      options: state.options,
      history: state.history,
      seed: Date.now(),
    })
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    setState((current) => ({
      ...current,
      currentPlan: result.plan,
      history: [...current.history, result.plan].slice(-HISTORY_LIMIT),
    }))
    setMessage('席替えを生成しました')
  }

  function selectSeat(key: string) {
    setSelectedSeat(key)
    setSwapTargetSeat('')
    setActiveAlertId((alertSeatMap.get(key) ?? [])[0]?.id ?? null)
  }

  function swapSeats() {
    if (!state.currentPlan || !selectedSeat || !swapTargetSeat) {
      setMessage('入れ替える席を選んでください')
      return
    }
    if (unavailable.has(selectedSeat) || unavailable.has(swapTargetSeat)) {
      setMessage('使用不可席は入れ替えできません')
      return
    }
    if (state.classroom.fixedAssignments[selectedSeat] || state.classroom.fixedAssignments[swapTargetSeat]) {
      setMessage('固定席は入れ替えできません')
      return
    }

    const assignments = { ...state.currentPlan.assignments }
    const selectedStudent = assignments[selectedSeat] ?? null
    assignments[selectedSeat] = assignments[swapTargetSeat] ?? null
    assignments[swapTargetSeat] = selectedStudent

    const updatedPlan = updatePlanAssignments({
      plan: state.currentPlan,
      assignments,
      students: state.students,
      classroom: state.classroom,
      separationRules: state.separationRules,
      options: state.options,
      history: state.history,
    })

    setState((current) => ({
      ...current,
      currentPlan: updatedPlan,
      history: current.history.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan)),
    }))
    setSelectedSeat(swapTargetSeat)
    setSwapTargetSeat('')
    setMessage('席を入れ替えました')
  }

  function loadPlan(plan: SeatingPlan) {
    setState((current) => ({ ...current, currentPlan: plan }))
    setMessage('履歴を表示しました')
  }

  function deletePlan(planId: string) {
    setState((current) => {
      const history = current.history.filter((plan) => plan.id !== planId)
      const currentPlan = current.currentPlan?.id === planId ? (history.at(-1) ?? null) : current.currentPlan
      return { ...current, history, currentPlan }
    })
    setMessage('履歴を削除しました')
  }

  function resetWorkspace() {
    setState(createInitialState())
    setSelectedSeat(null)
    setMessage('初期データに戻しました')
  }

  function exportJson() {
    downloadFile('sekigae-workspace.json', JSON.stringify(state, null, 2), 'application/json')
    setMessage('JSONを書き出しました')
  }

  function exportSeatsCsv() {
    if (!state.currentPlan) {
      setMessage('先に席替えを生成してください')
      return
    }
    const csv = exportPlanCsv(state.currentPlan, studentsById)
    downloadFile('sekigae-seats.csv', csv, 'text/csv;charset=utf-8')
    setMessage('座席CSVを書き出しました')
  }

  function exportPdf() {
    if (!state.currentPlan) {
      setMessage('先に席替えを生成してください')
      return
    }
    const pdf = buildPlanPdf(state.currentPlan, state.classroom, studentsById, state.rosterMode)
    downloadBinaryFile('sekigae-seats.pdf', pdf, 'application/pdf')
    setMessage('PDFを書き出しました')
  }

  function exportStudentsCsv() {
    downloadFile('sekigae-roster.csv', exportRosterCsv(state.students), 'text/csv;charset=utf-8')
    setMessage('名簿CSVを書き出しました')
  }

  function checkMigrationStatus() {
    const audit = buildMigrationAudit()
    setState((current) => ({ ...current, migrationAudit: audit }))
    setMessage(audit.note)
  }

  async function readWorkspaceFile(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as AppState
      setState(coerceState(parsed))
      setSelectedSeat(null)
      setMessage('JSONを読み込みました')
    } catch {
      setMessage('JSONを読み込めませんでした')
    } finally {
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  const selectedSeatStudentOptions = state.students.filter((student) => {
    if (student.id === selectedFixedStudent) return true
    return !Object.entries(state.classroom.fixedAssignments).some(
      ([seat, studentId]) => seat !== selectedSeat && studentId === student.id,
    )
  })
  const comparisonRows = buildComparisonRows(previousPlan, state.currentPlan)
  const selectedSwapStudent = selectedSeat && state.currentPlan ? studentsById.get(state.currentPlan.assignments[selectedSeat] ?? '') : null
  const targetSwapStudent = swapTargetSeat && state.currentPlan ? studentsById.get(state.currentPlan.assignments[swapTargetSeat] ?? '') : null

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          <div>
            <h1>席替え 5.5</h1>
            <p>{message}</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-button" type="button" title="JSONを読み込む" onClick={() => importFileRef.current?.click()}>
            <FileUp size={18} />
            <span>読込</span>
          </button>
          <button className="icon-button" type="button" title="JSONを書き出す" onClick={exportJson}>
            <Save size={18} />
            <span>保存</span>
          </button>
          <button className="icon-button" type="button" title="印刷" onClick={() => window.print()}>
            <Printer size={18} />
            <span>印刷</span>
          </button>
          <input
            ref={importFileRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void readWorkspaceFile(event.target.files?.[0])}
          />
        </div>
      </header>

      <main className="workspace">
        <aside className="rail">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">Classroom</span>
                <h2>教室</h2>
              </div>
              <span className={capacityOk ? 'status-pill success' : 'status-pill danger'}>
                {openSeatCount}席 / {state.students.length}人
              </span>
            </div>
            <div className="field-grid two">
              <label>
                行
                <select
                  value={state.classroom.rows}
                  onChange={(event) => setClassroomSize('rows', Number(event.target.value))}
                >
                  {CLASSROOM_SIZE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                列
                <select
                  value={state.classroom.cols}
                  onChange={(event) => setClassroomSize('cols', Number(event.target.value))}
                >
                  {CLASSROOM_SIZE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="metric-row">
              <Metric label="使用不可" value={state.classroom.unavailableSeats.length.toString()} />
              <Metric label="固定" value={fixedCount.toString()} />
              <Metric label="空席" value={Math.max(openSeatCount - state.students.length, 0).toString()} />
            </div>
            <div className="template-tools">
              <label>
                テンプレート名
                <input
                  value={templateName}
                  placeholder={`${state.classroom.rows}x${state.classroom.cols} 教室`}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              </label>
              <button type="button" className="secondary-button" onClick={saveClassroomTemplate}>
                <Save size={16} />
                保存
              </button>
              <label className="template-select">
                呼び出し
                <select
                  value=""
                  disabled={state.classroomTemplates.length === 0}
                  onChange={(event) => applyClassroomTemplate(event.target.value)}
                >
                  <option value="">テンプレートを選択</option>
                  {state.classroomTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {state.classroomTemplates.length > 0 ? (
              <div className="compact-list">
                {state.classroomTemplates.map((template) => (
                  <div className="compact-item" key={template.id}>
                    <button type="button" onClick={() => applyClassroomTemplate(template.id)}>
                      {template.name}
                      <span>
                        {template.classroom.rows}x{template.classroom.cols}
                      </span>
                    </button>
                    <button type="button" className="small-icon" title="テンプレートを削除" onClick={() => deleteClassroomTemplate(template.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">Roster</span>
                <h2>名簿</h2>
              </div>
              <span className="status-pill neutral">
                <Users size={14} />
                {state.students.length}
              </span>
            </div>
            <div className="mode-switch" role="group" aria-label="名簿方式">
              <button
                type="button"
                className={state.rosterMode === 'attendance' ? 'active' : ''}
                onClick={() => setRosterMode('attendance')}
              >
                出席番号方式
              </button>
              <button type="button" className={state.rosterMode === 'name' ? 'active' : ''} onClick={() => setRosterMode('name')}>
                名前方式
              </button>
            </div>
            {state.rosterMode === 'attendance' ? (
              <p className="mode-note">出席番号は使える席数に合わせて自動で用意されます。行列や使用不可席を変えると人数も同期します。</p>
            ) : (
              <>
                <div className="student-form">
                  <input
                    aria-label="名前"
                    placeholder="名前"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                  <select
                    aria-label="性別"
                    value={draft.gender}
                    onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value as Gender }))}
                  >
                    <option value="unspecified">指定なし</option>
                    <option value="boy">男子</option>
                    <option value="girl">女子</option>
                  </select>
                  <select
                    aria-label="視力配慮"
                    value={draft.vision}
                    onChange={(event) => setDraft((current) => ({ ...current, vision: event.target.value as VisionNeed }))}
                  >
                    <option value="standard">視力:標準</option>
                    <option value="front">視力:前方</option>
                  </select>
                  <select
                    aria-label="身長配慮"
                    value={draft.height}
                    onChange={(event) => setDraft((current) => ({ ...current, height: event.target.value as HeightNeed }))}
                  >
                    <option value="standard">身長:標準</option>
                    <option value="back">身長:後方</option>
                  </select>
                  <input
                    aria-label="メモ"
                    placeholder="メモ"
                    value={draft.note}
                    onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                  />
                  <button type="button" className="primary-button" onClick={addStudent} disabled={!draft.name.trim()}>
                    <UserPlus size={18} />
                    追加
                  </button>
                </div>
                <textarea
                  className="import-area"
                  aria-label="CSV/TSV貼り付け"
                  placeholder="名前, 性別, 視力, 身長, メモ"
                  rows={4}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                />
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={importRoster} disabled={!importText.trim()}>
                    <FileDown size={16} />
                    一括追加
                  </button>
                  <button type="button" className="secondary-button" onClick={exportStudentsCsv}>
                    <Download size={16} />
                    CSV
                  </button>
                </div>
              </>
            )}
            <div className="student-list" data-testid="student-list">
              {state.students.map((student) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  rosterMode={state.rosterMode}
                  onUpdate={updateStudent}
                  onRemove={removeStudent}
                />
              ))}
            </div>
          </section>
        </aside>

        <section className="board-panel">
          <div className="board-toolbar">
            <div>
              <span className="kicker">Seating Board</span>
              <h2>黒板側</h2>
            </div>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={resetWorkspace} title="初期状態に戻す">
                <RotateCcw size={16} />
                リセット
              </button>
              <button type="button" className="primary-button" onClick={generate} data-testid="generate-button">
                <Shuffle size={18} />
                席替え
              </button>
            </div>
          </div>

          <div className="board-strip" aria-label="座席ビューの状態">
            <div className="view-tabs">
              <span className="active">配置</span>
              <span>比較</span>
              <span>手動調整</span>
            </div>
            <div className="seat-legend">
              <span className="legend-boy">男子</span>
              <span className="legend-girl">女子</span>
              <span className="legend-repeat">再発</span>
              <span className="legend-fixed">固定</span>
              <span className="legend-alert">注意</span>
            </div>
          </div>

          <div
            className="seat-grid"
            style={{ gridTemplateColumns: `repeat(${state.classroom.cols}, minmax(var(--seat-min), 1fr))` }}
            data-testid="seat-grid"
          >
            {seats.map((key) => {
              const [row, col] = parseSeatKey(key)
              const studentId = state.currentPlan?.assignments[key] ?? state.classroom.fixedAssignments[key] ?? null
              const student = studentId ? studentsById.get(studentId) : null
              const blocked = unavailable.has(key)
              const fixed = Boolean(state.classroom.fixedAssignments[key])
              const repeatedHorizontal = isHorizontalRepeat(key, state.currentPlan, previousHorizontalPairs)
              const seatAlerts = alertSeatMap.get(key) ?? []
              const alertLabels = seatAlerts.map((alert) => alert.label)
              const alertKind = alertKindForSeat(alertLabels)
              const selected = selectedSeat === key
              return (
                <button
                  type="button"
                  key={key}
                  className={[
                    'seat-tile',
                    blocked ? 'blocked' : '',
                    fixed ? 'fixed' : '',
                    selected ? 'selected' : '',
                    repeatedHorizontal ? 'repeat' : '',
                    seatAlerts.length > 0 ? 'alert-target' : '',
                    alertKind ? `alert-${alertKind}` : '',
                    student?.gender === 'boy' ? 'boy' : '',
                    student?.gender === 'girl' ? 'girl' : '',
                  ].join(' ')}
                  onClick={() => selectSeat(key)}
                  title={`${row + 1}行 ${col + 1}列${alertLabels.length > 0 ? ` / 注意: ${alertLabels.join('、')}` : ''}`}
                >
                  <span className="seat-index">
                    {row + 1}-{col + 1}
                  </span>
                  <strong>{blocked ? '使用不可' : student ? displayStudentName(student, state.rosterMode) : '空席'}</strong>
                  <span>{student ? studentCareLabel(student) || genderLabel(student.gender) : fixed ? '固定' : ''}</span>
                  {fixed ? <Lock className="seat-lock" size={13} aria-hidden="true" /> : null}
                  {seatAlerts.length > 0 ? <span className="seat-alert-badge">注意</span> : null}
                </button>
              )
            })}
          </div>

          <div className="seat-editor">
            <div>
              <span className="kicker">Seat</span>
              <h3>{selectedSeatLabel}</h3>
            </div>
            {selectedSeat ? (
              <>
                <button
                  type="button"
                  className={unavailable.has(selectedSeat) ? 'danger-button' : 'secondary-button'}
                  onClick={() => toggleUnavailable(selectedSeat)}
                >
                  <X size={16} />
                  {unavailable.has(selectedSeat) ? '使用可に戻す' : '使用しない'}
                </button>
                <label>
                  固定する児童
                  <select
                    value={selectedFixedStudent ?? ''}
                    disabled={unavailable.has(selectedSeat)}
                    onChange={(event) => setFixedSeat(selectedSeat, event.target.value)}
                  >
                    <option value="">固定なし</option>
                    {selectedSeatStudentOptions.map((student) => (
                      <option key={student.id} value={student.id}>
                        {displayStudentName(student, state.rosterMode)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="swap-editor">
                  <div className="swap-preview" aria-live="polite">
                    <span>
                      {selectedSeatLabel} / {selectedSwapStudent ? displayStudentName(selectedSwapStudent, state.rosterMode) : '空席'}
                    </span>
                    <strong>↔</strong>
                    <span>
                      {swapTargetSeat ? seatLabel(swapTargetSeat) : '入れ替え先'} /{' '}
                      {targetSwapStudent ? displayStudentName(targetSwapStudent, state.rosterMode) : '空席'}
                    </span>
                  </div>
                  <label>
                    入れ替え先
                    <select
                      value={swapTargetSeat}
                      disabled={!state.currentPlan || unavailable.has(selectedSeat) || selectedSeatLocked}
                      onChange={(event) => setSwapTargetSeat(event.target.value)}
                    >
                      <option value="">席を選択</option>
                      {swapSeatOptions.map((key) => {
                        const studentId = state.currentPlan?.assignments[key] ?? null
                        const student = studentId ? studentsById.get(studentId) : null
                        return (
                          <option key={key} value={key}>
                            {seatLabel(key)} / {student ? displayStudentName(student, state.rosterMode) : '空席'}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={swapSeats}
                    disabled={!state.currentPlan || !swapTargetSeat || unavailable.has(selectedSeat) || selectedSeatLocked}
                  >
                    <Shuffle size={16} />
                    入れ替え
                  </button>
                  {selectedSeatLocked ? <p>固定席は入れ替え対象外です</p> : null}
                </div>
              </>
            ) : (
              <p>席を選択してください</p>
            )}
          </div>
        </section>

        <aside className="rail analytics-rail">
          <section className="panel comparison-panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">Compare</span>
                <h2>比較サマリー</h2>
              </div>
              <button type="button" className="text-button" onClick={() => setDetailsOpen((current) => !current)}>
                {detailsOpen ? '閉じる' : '詳細'}
              </button>
            </div>
            <ComparisonTable rows={comparisonRows} />
            {detailsOpen ? <AlertDetailPanel details={alertDetails} activeAlertId={activeAlertId} /> : null}
          </section>

          <section className="panel warning-panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">Alerts</span>
                <h2>注意</h2>
              </div>
              <span className={alerts.length > 0 ? 'status-pill danger' : 'status-pill success'}>{alerts.length}件</span>
            </div>
            <div className="warning-list">
              {alerts.length === 0 ? <p>再発注意はありません</p> : null}
              {alerts.map((alert) => (
                <button
                  type="button"
                  className={`warning-item ${alert.kind} ${activeAlertId === alert.id ? 'active' : ''}`}
                  key={alert.id}
                  onClick={() => {
                    setActiveAlertId(alert.id)
                    setDetailsOpen(true)
                  }}
                >
                  <span>{alert.label}</span>
                  {alert.seats.length > 0 ? <small>{formatAlertSeats(alert.seats)}</small> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">Rules</span>
                <h2>生成条件</h2>
              </div>
              <button type="button" className="text-button" onClick={() => updateOptions(DEFAULT_OPTIONS)}>
                標準値
              </button>
            </div>
            <OptionSlider label="試行" value={state.options.trials} min={20} max={400} step={20} onChange={(trials) => updateOptions({ trials })} />
            <OptionSlider
              label="改善"
              value={state.options.improvementSteps}
              min={40}
              max={600}
              step={20}
              onChange={(improvementSteps) => updateOptions({ improvementSteps })}
            />
            <OptionSelect
              label="再発判定"
              value={state.options.historyDepth}
              options={RECURRENCE_HISTORY_DEPTH_OPTIONS.map((count) => ({ value: count, label: `過去${count}回` }))}
              onChange={(historyDepth) => updateOptions({ historyDepth })}
            />
            <OptionSlider
              label="前方"
              value={state.options.frontWeight}
              min={0}
              max={10}
              step={1}
              onChange={(frontWeight) => updateOptions({ frontWeight })}
            />
            <OptionSlider
              label="同席"
              value={state.options.sameSeatPenalty}
              min={0}
              max={20}
              step={1}
              onChange={(sameSeatPenalty) => updateOptions({ sameSeatPenalty })}
            />
            <OptionSlider
              label="隣席"
              value={state.options.neighborPenalty}
              min={0}
              max={20}
              step={1}
              onChange={(neighborPenalty) => updateOptions({ neighborPenalty })}
            />
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={state.options.preferGenderMix}
                onChange={(event) => updateOptions({ preferGenderMix: event.target.checked })}
              />
              男女ペアを配慮
            </label>
            <SeparationRuleEditor
              students={state.students}
              rosterMode={state.rosterMode}
              draft={separationDraft}
              rules={state.separationRules}
              onDraftChange={setSeparationDraft}
              onAdd={addSeparationRule}
              onDelete={deleteSeparationRule}
            />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">Result</span>
                <h2>結果</h2>
              </div>
              <span className="status-pill neutral">score {Math.round(state.currentPlan?.score ?? 0)}</span>
            </div>
            <ResultMetrics plan={state.currentPlan} />
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={exportSeatsCsv}>
                <Download size={16} />
                座席CSV
              </button>
              <button type="button" className="secondary-button" onClick={() => window.print()}>
                <Printer size={16} />
                A4
              </button>
              <button type="button" className="secondary-button" onClick={exportPdf}>
                <FileText size={16} />
                PDF
              </button>
            </div>
            <StudentReasonList reasons={studentReasons} />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">Migration</span>
                <h2>移行確認</h2>
              </div>
              <button type="button" className="text-button" onClick={checkMigrationStatus}>
                確認
              </button>
            </div>
            <MigrationStatus audit={state.migrationAudit} />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="kicker">History</span>
                <h2>履歴</h2>
              </div>
              <History size={18} aria-hidden="true" />
            </div>
            <div className="history-list">
              {state.history.length === 0 ? <p>まだ履歴がありません</p> : null}
              {state.history
                .slice()
                .reverse()
                .map((plan) => (
                  <div className="history-item" key={plan.id}>
                    <button type="button" onClick={() => loadPlan(plan)}>
                      <strong>{formatDate(plan.createdAt)}</strong>
                      <span>
                        同席 {plan.diagnostics.sameSeatRepeats} / 同隣 {plan.diagnostics.neighborRepeats}
                      </span>
                    </button>
                    <button type="button" className="small-icon" title="履歴を削除" onClick={() => deletePlan(plan.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </main>
      <footer className="status-bar">
        <span>Local only</span>
        <span>{state.rosterMode === 'attendance' ? '出席番号方式' : '名前方式'}</span>
        <span>{openSeatCount}席 / {state.students.length}人</span>
        <span>{state.currentPlan ? `最終生成 ${formatDate(state.currentPlan.createdAt)}` : '未生成'}</span>
      </footer>
    </div>
  )
}

function StudentRow({
  student,
  rosterMode,
  onUpdate,
  onRemove,
}: {
  student: Student
  rosterMode: RosterMode
  onUpdate: (id: string, patch: Partial<Student>) => void
  onRemove: (id: string) => void
}) {
  const label = rosterMode === 'attendance' ? `${student.attendanceNumber ?? student.name}番` : student.name
  return (
    <div className="student-row">
      <div className="student-row-main">
        <input
          aria-label={rosterMode === 'attendance' ? `${label}の出席番号` : `${student.name}の名前`}
          value={rosterMode === 'attendance' ? label : student.name}
          readOnly={rosterMode === 'attendance'}
          onChange={(event) => onUpdate(student.id, { name: event.target.value })}
        />
        {rosterMode === 'name' ? (
          <button type="button" className="small-icon" title="児童を削除" onClick={() => onRemove(student.id)}>
            <Trash2 size={15} />
          </button>
        ) : (
          <span className="number-badge" aria-label="自動生成">
            自動
          </span>
        )}
      </div>
      <div className="student-row-controls">
        <select
          aria-label={`${label}の性別`}
          value={student.gender}
          onChange={(event) => onUpdate(student.id, { gender: event.target.value as Gender })}
        >
          <option value="unspecified">指定なし</option>
          <option value="boy">男子</option>
          <option value="girl">女子</option>
        </select>
        <select
          aria-label={`${label}の視力配慮`}
          value={student.vision}
          onChange={(event) => onUpdate(student.id, { vision: event.target.value as VisionNeed })}
        >
          <option value="standard">標準</option>
          <option value="front">前方</option>
        </select>
        <select
          aria-label={`${label}の身長配慮`}
          value={student.height}
          onChange={(event) => onUpdate(student.id, { height: event.target.value as HeightNeed })}
        >
          <option value="standard">標準</option>
          <option value="back">後方</option>
        </select>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function OptionSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}</strong>
    </label>
  )
}

function OptionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: number
  options: { value: number; label: string }[]
  onChange: (value: number) => void
}) {
  return (
    <label className="select-row">
      <span>{label}</span>
      <select aria-label={`${label}の参照回数`} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <strong>{value}回</strong>
    </label>
  )
}

function SeparationRuleEditor({
  students,
  rosterMode,
  draft,
  rules,
  onDraftChange,
  onAdd,
  onDelete,
}: {
  students: Student[]
  rosterMode: RosterMode
  draft: SeparationDraft
  rules: SeparationRule[]
  onDraftChange: (draft: SeparationDraft) => void
  onAdd: () => void
  onDelete: (id: string) => void
}) {
  const byId = new Map(students.map((student) => [student.id, student]))
  return (
    <div className="rule-editor">
      <div className="rule-grid">
        <label>
          離す児童A
          <select
            aria-label="離す児童A"
            value={draft.leftStudentId}
            onChange={(event) => onDraftChange({ ...draft, leftStudentId: event.target.value })}
          >
            <option value="">選択</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {displayStudentName(student, rosterMode)}
              </option>
            ))}
          </select>
        </label>
        <label>
          離す児童B
          <select
            aria-label="離す児童B"
            value={draft.rightStudentId}
            onChange={(event) => onDraftChange({ ...draft, rightStudentId: event.target.value })}
          >
            <option value="">選択</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {displayStudentName(student, rosterMode)}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="離す理由メモ"
          placeholder="理由メモ"
          value={draft.note}
          onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
        />
        <button type="button" className="secondary-button" onClick={onAdd}>
          追加
        </button>
      </div>
      <div className="compact-list">
        {rules.length === 0 ? <p>離すルールはありません</p> : null}
        {rules.map((rule) => {
          const left = byId.get(rule.leftStudentId)
          const right = byId.get(rule.rightStudentId)
          return (
            <div className="compact-item" key={rule.id}>
              <span>
                {left ? displayStudentName(left, rosterMode) : '不明'} / {right ? displayStudentName(right, rosterMode) : '不明'}
                {rule.note ? <small>{rule.note}</small> : null}
              </span>
              <button type="button" className="small-icon" title="離すルールを削除" onClick={() => onDelete(rule.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AlertDetailPanel({ details, activeAlertId }: { details: AlertDetail[]; activeAlertId: string | null }) {
  return (
    <div className="detail-list">
      {details.length === 0 ? <p>詳細はまだありません</p> : null}
      {details.map((detail) => (
        <div className={`detail-item ${activeAlertId === detail.alertId ? 'active' : ''}`} key={detail.alertId}>
          <strong>{detail.title}</strong>
          {detail.lines.length === 0 ? <span>該当なし</span> : null}
          {detail.lines.slice(0, 10).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

function StudentReasonList({ reasons }: { reasons: StudentReason[] }) {
  return (
    <div className="reason-list">
      <strong>児童別理由</strong>
      {reasons.length === 0 ? <p>生成後に表示されます</p> : null}
      {reasons.slice(0, 8).map((reason) => (
        <div className="reason-item" key={reason.studentId}>
          <span>
            {reason.label} / {reason.seat}
          </span>
          <small>{reason.reasons.join('、')}</small>
        </div>
      ))}
    </div>
  )
}

function MigrationStatus({ audit }: { audit: MigrationAudit | null }) {
  if (!audit) return <p className="mode-note">この端末の旧データ有無を必要なときに確認できます。</p>
  return (
    <div className="migration-status">
      <Metric label="移行済" value={String(audit.migratedCount)} />
      <Metric label="未移行" value={String(audit.pendingCount)} />
      <Metric label="履歴" value={String(audit.historyCount)} />
      <p>{audit.note}</p>
    </div>
  )
}

function ResultMetrics({ plan }: { plan: SeatingPlan | null }) {
  if (!plan) {
    return (
      <div className="empty-result">
        <Shuffle size={22} />
        <p>未生成</p>
      </div>
    )
  }

  const frontRate = rate(plan.diagnostics.frontNeedFrontHalf, plan.diagnostics.frontNeedTotal)
  const backRate = rate(plan.diagnostics.tallBackHalf, plan.diagnostics.tallTotal)
  return (
    <div className="metric-column">
      <Metric label="前方配慮" value={frontRate} />
      <Metric label="後方配慮" value={backRate} />
      <Metric label="同席再発" value={plan.diagnostics.sameSeatRepeats.toString()} />
      <Metric label="同隣再発" value={plan.diagnostics.neighborRepeats.toString()} />
      <Metric label="左右再発" value={plan.diagnostics.horizontalPairRepeats.toString()} />
      <Metric label="離席注意" value={String(plan.diagnostics.separationViolations ?? 0)} />
    </div>
  )
}

function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="comparison-table" role="table" aria-label="前回との比較">
      <div className="comparison-row comparison-head" role="row">
        <span role="columnheader">観点</span>
        <span role="columnheader">前回</span>
        <span role="columnheader">今回</span>
        <span role="columnheader">差分</span>
      </div>
      {rows.map((row) => (
        <div className="comparison-row" role="row" key={row.label}>
          <span role="cell">{row.label}</span>
          <span role="cell">{row.previous}</span>
          <span role="cell">{row.current}</span>
          <strong className={`delta ${row.tone}`} role="cell">
            {row.delta}
          </strong>
        </div>
      ))}
    </div>
  )
}

function buildComparisonRows(previousPlan: SeatingPlan | null, currentPlan: SeatingPlan | null): ComparisonRow[] {
  const rows = [
    buildNumericComparison('score', previousPlan?.score, currentPlan?.score, 'higher', Math.round),
    buildRateComparison(
      '前方配慮',
      previousPlan?.diagnostics.frontNeedFrontHalf,
      previousPlan?.diagnostics.frontNeedTotal,
      currentPlan?.diagnostics.frontNeedFrontHalf,
      currentPlan?.diagnostics.frontNeedTotal,
    ),
    buildRateComparison(
      '後方配慮',
      previousPlan?.diagnostics.tallBackHalf,
      previousPlan?.diagnostics.tallTotal,
      currentPlan?.diagnostics.tallBackHalf,
      currentPlan?.diagnostics.tallTotal,
    ),
    buildNumericComparison(
      '同席再発',
      previousPlan?.diagnostics.sameSeatRepeats,
      currentPlan?.diagnostics.sameSeatRepeats,
      'lower',
    ),
    buildNumericComparison(
      '同隣再発',
      previousPlan?.diagnostics.neighborRepeats,
      currentPlan?.diagnostics.neighborRepeats,
      'lower',
    ),
    buildNumericComparison(
      '左右再発',
      previousPlan?.diagnostics.horizontalPairRepeats,
      currentPlan?.diagnostics.horizontalPairRepeats,
      'lower',
    ),
    buildNumericComparison(
      '離席注意',
      previousPlan?.diagnostics.separationViolations,
      currentPlan?.diagnostics.separationViolations,
      'lower',
    ),
  ]
  return rows
}

function buildNumericComparison(
  label: string,
  previousValue: number | undefined,
  currentValue: number | undefined,
  better: 'higher' | 'lower',
  format: (value: number) => number = (value) => value,
): ComparisonRow {
  const previous = Number.isFinite(previousValue) ? format(previousValue as number) : null
  const current = Number.isFinite(currentValue) ? format(currentValue as number) : null
  const delta = previous !== null && current !== null ? current - previous : null
  return {
    label,
    previous: previous === null ? '-' : String(previous),
    current: current === null ? '-' : String(current),
    delta: formatDelta(delta),
    tone: toneForDelta(delta, better),
  }
}

function buildRateComparison(
  label: string,
  previousValue: number | undefined,
  previousTotal: number | undefined,
  currentValue: number | undefined,
  currentTotal: number | undefined,
): ComparisonRow {
  const previousPercent = percentValue(previousValue, previousTotal)
  const currentPercent = percentValue(currentValue, currentTotal)
  const delta = previousPercent !== null && currentPercent !== null ? currentPercent - previousPercent : null
  return {
    label,
    previous: previousPercent === null ? '-' : `${previousPercent}%`,
    current: currentPercent === null ? '-' : `${currentPercent}%`,
    delta: formatDelta(delta, '%'),
    tone: toneForDelta(delta, 'higher'),
  }
}

function buildAlerts(
  plan: SeatingPlan | null,
  history: SeatingPlan[],
  historyDepth: number,
  classroom: AppState['classroom'],
  separationRules: SeparationRule[],
): AlertItem[] {
  if (!plan) return [{ id: 'not-generated', kind: 'not-generated', label: 'まだ生成されていません', seats: [] }]

  const previousPlans = history.filter((item) => item.id !== plan.id).slice(-clampRecurrenceDepth(historyDepth))
  const past = buildAlertHistoryIndex(previousPlans)
  const unavailable = new Set(classroom.unavailableSeats)
  const alerts: AlertItem[] = []

  const sameSeatSeats = Object.entries(plan.assignments)
    .filter(([key, studentId]) => Boolean(studentId && past.seatByStudent.get(studentId)?.has(key)))
    .map(([key]) => key)
    .sort(compareSeatKeys)

  if (sameSeatSeats.length > 0) {
    alerts.push({
      id: 'same-seat',
      kind: 'same-seat',
      label: `同じ席の再発が ${sameSeatSeats.length} 件あります`,
      seats: sameSeatSeats,
    })
  }

  const neighborSeats = repeatedPairSeatKeys(plan.assignments, classroom, past.neighborPairs, 'all')
  if (neighborSeats.length > 0) {
    alerts.push({
      id: 'neighbor',
      kind: 'neighbor',
      label: `前回と同じ隣接が ${neighborSeats.length} 席に関係しています`,
      seats: neighborSeats,
    })
  }

  const horizontalSeats = repeatedPairSeatKeys(plan.assignments, classroom, past.leftRightPairs, 'horizontal')
  if (horizontalSeats.length > 0) {
    alerts.push({
      id: 'horizontal',
      kind: 'horizontal',
      label: `左右ペアの再発が ${horizontalSeats.length} 席に関係しています`,
      seats: horizontalSeats,
    })
  }

  const separationSeats = separationViolationSeatKeys(plan.assignments, classroom, separationRules)
  if (separationSeats.length > 0) {
    alerts.push({
      id: 'separation',
      kind: 'separation',
      label: `離すルールに近い席が ${separationSeats.length} 席あります`,
      seats: separationSeats,
    })
  }

  const emptySeats = buildSeatList(classroom)
    .filter((key) => !unavailable.has(key) && !plan.assignments[key])
    .sort(compareSeatKeys)

  if (emptySeats.length > 0) {
    alerts.push({
      id: 'empty',
      kind: 'empty',
      label: `空席が ${emptySeats.length} 席あります`,
      seats: emptySeats,
    })
  }

  return alerts
}

function buildAlertHistoryIndex(history: SeatingPlan[]) {
  const seatByStudent = new Map<string, Set<string>>()
  const neighborPairs = new Set<string>()
  const leftRightPairs = new Set<string>()

  history.forEach((plan) => {
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

function buildAlertSeatMap(alerts: AlertItem[]): Map<string, AlertItem[]> {
  const map = new Map<string, AlertItem[]>()
  alerts.forEach((alert) => {
    alert.seats.forEach((seat) => {
      const items = map.get(seat) ?? []
      items.push(alert)
      map.set(seat, items)
    })
  })
  return map
}

function buildAlertDetails(
  plan: SeatingPlan | null,
  history: SeatingPlan[],
  historyDepth: number,
  classroom: AppState['classroom'],
  separationRules: SeparationRule[],
  studentsById: Map<string, Student>,
): AlertDetail[] {
  if (!plan) return []
  const previousPlans = history.filter((item) => item.id !== plan.id).slice(-clampRecurrenceDepth(historyDepth))
  const past = buildAlertHistoryIndex(previousPlans)
  return [
    {
      alertId: 'same-seat',
      title: '同じ席',
      lines: Object.entries(plan.assignments)
        .filter(([key, studentId]) => Boolean(studentId && past.seatByStudent.get(studentId)?.has(key)))
        .map(([key, studentId]) => `${studentName(studentsById, studentId)}: ${seatLabel(key)}`),
    },
    {
      alertId: 'neighbor',
      title: '同じ隣接',
      lines: repeatedPairDetails(plan.assignments, classroom, past.neighborPairs, 'all', studentsById),
    },
    {
      alertId: 'horizontal',
      title: '左右ペア',
      lines: repeatedPairDetails(plan.assignments, classroom, past.leftRightPairs, 'horizontal', studentsById),
    },
    {
      alertId: 'separation',
      title: '離すルール',
      lines: separationViolationDetails(plan.assignments, classroom, separationRules, studentsById),
    },
  ].filter((detail) => detail.lines.length > 0)
}

function buildStudentReasons(
  plan: SeatingPlan | null,
  history: SeatingPlan[],
  historyDepth: number,
  classroom: AppState['classroom'],
  separationRules: SeparationRule[],
  studentsById: Map<string, Student>,
  rosterMode: RosterMode,
): StudentReason[] {
  if (!plan) return []
  const previousPlans = history.filter((item) => item.id !== plan.id).slice(-clampRecurrenceDepth(historyDepth))
  const past = buildAlertHistoryIndex(previousPlans)
  const currentPairs = new Set(adjacencyPairsForAssignments(plan.assignments, classroom))

  return Object.entries(plan.assignments)
    .flatMap(([key, studentId]) => {
      const student = studentId ? studentsById.get(studentId) : null
      if (!student || !studentId) return []
      const [row] = parseSeatKey(key)
      const reasons: string[] = []
      if (student.vision === 'front') reasons.push(row < Math.ceil(classroom.rows / 2) ? '前方配慮OK' : '前方配慮は未達')
      if (student.height === 'back') reasons.push(row >= Math.floor(classroom.rows / 2) ? '後方配慮OK' : '後方配慮は未達')
      if (past.seatByStudent.get(studentId)?.has(key)) reasons.push('同じ席の再発')
      if (studentHasRepeatedPair(studentId, plan.assignments, classroom, past.neighborPairs)) reasons.push('同じ隣接あり')
      if (
        separationRules.some(
          (rule) =>
            (rule.leftStudentId === studentId || rule.rightStudentId === studentId) &&
            currentPairs.has(studentPairKey(rule.leftStudentId, rule.rightStudentId)),
        )
      ) {
        reasons.push('離すルールに注意')
      }
      if (reasons.length === 0) reasons.push('通常配置')
      return [{ studentId, label: displayStudentName(student, rosterMode), seat: seatLabel(key), reasons }]
    })
    .sort((left, right) => left.seat.localeCompare(right.seat, 'ja'))
}

function repeatedPairSeatKeys(
  assignments: Record<string, string | null>,
  classroom: Pick<AppState['classroom'], 'rows' | 'cols'>,
  pastPairs: Set<string>,
  mode: 'all' | 'horizontal',
): string[] {
  const seats = new Set<string>()
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) {
      const here = seatKey(row, col)
      const candidates = mode === 'horizontal' ? [seatKey(row, col + 1)] : [seatKey(row, col + 1), seatKey(row + 1, col)]
      candidates.forEach((other) => {
        if (!pairExists(assignments[here], assignments[other], pastPairs)) return
        seats.add(here)
        seats.add(other)
      })
    }
  }
  return Array.from(seats).sort(compareSeatKeys)
}

function repeatedPairDetails(
  assignments: Record<string, string | null>,
  classroom: Pick<AppState['classroom'], 'rows' | 'cols'>,
  pastPairs: Set<string>,
  mode: 'all' | 'horizontal',
  studentsById: Map<string, Student>,
): string[] {
  const lines = new Set<string>()
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) {
      const here = seatKey(row, col)
      const candidates = mode === 'horizontal' ? [seatKey(row, col + 1)] : [seatKey(row, col + 1), seatKey(row + 1, col)]
      candidates.forEach((other) => {
        if (!pairExists(assignments[here], assignments[other], pastPairs)) return
        lines.add(`${studentName(studentsById, assignments[here])} / ${studentName(studentsById, assignments[other])}: ${seatLabel(here)}・${seatLabel(other)}`)
      })
    }
  }
  return Array.from(lines)
}

function separationViolationSeatKeys(
  assignments: Record<string, string | null>,
  classroom: Pick<AppState['classroom'], 'rows' | 'cols'>,
  rules: SeparationRule[],
): string[] {
  const rulePairs = new Set(rules.map((rule) => studentPairKey(rule.leftStudentId, rule.rightStudentId)))
  const seats = new Set<string>()
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) {
      const here = seatKey(row, col)
      ;[seatKey(row, col + 1), seatKey(row + 1, col)].forEach((other) => {
        const left = assignments[here]
        const right = assignments[other]
        if (!left || !right || !rulePairs.has(studentPairKey(left, right))) return
        seats.add(here)
        seats.add(other)
      })
    }
  }
  return Array.from(seats).sort(compareSeatKeys)
}

function separationViolationDetails(
  assignments: Record<string, string | null>,
  classroom: Pick<AppState['classroom'], 'rows' | 'cols'>,
  rules: SeparationRule[],
  studentsById: Map<string, Student>,
): string[] {
  const rulePairs = new Map(rules.map((rule) => [studentPairKey(rule.leftStudentId, rule.rightStudentId), rule]))
  const lines = new Set<string>()
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) {
      const here = seatKey(row, col)
      ;[seatKey(row, col + 1), seatKey(row + 1, col)].forEach((other) => {
        const left = assignments[here]
        const right = assignments[other]
        if (!left || !right) return
        const rule = rulePairs.get(studentPairKey(left, right))
        if (!rule) return
        lines.add(
          `${studentName(studentsById, left)} / ${studentName(studentsById, right)}: ${seatLabel(here)}・${seatLabel(other)}${rule.note ? ` (${rule.note})` : ''}`,
        )
      })
    }
  }
  return Array.from(lines)
}

function adjacencyPairsForAssignments(
  assignments: Record<string, string | null>,
  classroom: Pick<AppState['classroom'], 'rows' | 'cols'>,
): string[] {
  const pairs = new Set<string>()
  for (let row = 0; row < classroom.rows; row += 1) {
    for (let col = 0; col < classroom.cols; col += 1) {
      const here = assignments[seatKey(row, col)]
      const right = assignments[seatKey(row, col + 1)]
      const down = assignments[seatKey(row + 1, col)]
      if (here && right && here !== right) pairs.add(studentPairKey(here, right))
      if (here && down && here !== down) pairs.add(studentPairKey(here, down))
    }
  }
  return Array.from(pairs)
}

function studentHasRepeatedPair(
  studentId: string,
  assignments: Record<string, string | null>,
  classroom: Pick<AppState['classroom'], 'rows' | 'cols'>,
  pastPairs: Set<string>,
): boolean {
  return adjacencyPairsForAssignments(assignments, classroom).some((pair) => {
    const [left, right] = pair.split('|')
    return (left === studentId || right === studentId) && pastPairs.has(pair)
  })
}

function studentName(studentsById: Map<string, Student>, studentId: string | null | undefined): string {
  if (!studentId) return '空席'
  return studentsById.get(studentId)?.name ?? '不明'
}

function alertKindForSeat(labels: string[]): AlertKind | null {
  if (labels.length === 0) return null
  if (labels.some((label) => label.includes('同じ席'))) return 'same-seat'
  if (labels.some((label) => label.includes('左右ペア'))) return 'horizontal'
  if (labels.some((label) => label.includes('離すルール'))) return 'separation'
  if (labels.some((label) => label.includes('隣接'))) return 'neighbor'
  if (labels.some((label) => label.includes('空席'))) return 'empty'
  return 'neighbor'
}

function formatAlertSeats(seats: string[]): string {
  const labels = seats.slice(0, 8).map(seatLabel)
  const remaining = seats.length - labels.length
  return remaining > 0 ? `${labels.join('、')} ほか${remaining}席` : labels.join('、')
}

function compareSeatKeys(left: string, right: string): number {
  const [leftRow, leftCol] = parseSeatKey(left)
  const [rightRow, rightCol] = parseSeatKey(right)
  if (leftRow !== rightRow) return leftRow - rightRow
  return leftCol - rightCol
}

function loadState(): { state: AppState; migratedLegacy: boolean } {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      return { state: coerceState(JSON.parse(raw) as AppState), migratedLegacy: false }
    } catch {
      // Fall through to legacy migration or initial state.
    }
  }
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (legacyRaw) {
    try {
      const migrated = migrateLegacyState(JSON.parse(legacyRaw))
      if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        return { state: migrated, migratedLegacy: true }
      }
    } catch {
      // Ignore unreadable legacy payloads and start safely.
    }
  }
  return { state: createInitialState(), migratedLegacy: false }
}

function coerceState(candidate: Partial<AppState>): AppState {
  const initial = createInitialState()
  const rosterMode: RosterMode =
    candidate.rosterMode === 'attendance' || candidate.rosterMode === 'name'
      ? candidate.rosterMode
      : initial.rosterMode
  const classroom = {
    ...initial.classroom,
    ...(candidate.classroom ?? {}),
  }
  const baseStudents = Array.isArray(candidate.students) ? candidate.students : initial.students
  const students =
    rosterMode === 'attendance'
      ? createAttendanceStudents(availableSeatCount(classroom), baseStudents)
      : baseStudents
  const options = {
    ...initial.options,
    ...(candidate.options ?? {}),
  }
  options.historyDepth = clampRecurrenceDepth(options.historyDepth)
  const history = Array.isArray(candidate.history) ? candidate.history.slice(-HISTORY_LIMIT) : []
  const studentIds = new Set(students.map((student) => student.id))
  const separationRules = Array.isArray(candidate.separationRules)
    ? candidate.separationRules.filter(
        (rule) =>
          rule &&
          studentIds.has(rule.leftStudentId) &&
          studentIds.has(rule.rightStudentId) &&
          rule.leftStudentId !== rule.rightStudentId,
      )
    : []
  const classroomTemplates = Array.isArray(candidate.classroomTemplates)
    ? candidate.classroomTemplates
        .filter((template) => template?.classroom)
        .map((template) => ({
          id: String(template.id || makeLocalId('template')),
          name: String(template.name || '教室テンプレート'),
          classroom: normalizeClassroom(template.classroom),
        }))
        .slice(-12)
    : []
  return {
    rosterMode,
    students,
    classroom: normalizeClassroom(classroom),
    classroomTemplates,
    separationRules,
    options,
    currentPlan: candidate.currentPlan ?? history.at(-1) ?? null,
    history,
    migrationAudit: candidate.migrationAudit ?? null,
  }
}

function findPreviousPlan(currentPlan: SeatingPlan | null, history: SeatingPlan[]): SeatingPlan | null {
  if (!currentPlan) return history.at(-1) ?? null
  const index = history.findIndex((plan) => plan.id === currentPlan.id)
  if (index > 0) return history[index - 1]
  if (index === -1) return history.at(-1) ?? null
  return null
}

function isHorizontalRepeat(currentKey: string, plan: SeatingPlan | null, previousPairs: Set<string>): boolean {
  if (!plan) return false
  const [row, col] = parseSeatKey(currentKey)
  const here = plan.assignments[currentKey]
  const right = plan.assignments[seatKey(row, col + 1)]
  const left = plan.assignments[seatKey(row, col - 1)]
  return pairExists(here, right, previousPairs) || pairExists(left, here, previousPairs)
}

function pairExists(left: string | null | undefined, right: string | null | undefined, pairs: Set<string>): boolean {
  if (!left || !right || left === right) return false
  return pairs.has(studentPairKey(left, right))
}

function exportPlanCsv(plan: SeatingPlan, studentsById: Map<string, Student>): string {
  const rows = [['行', '列', '名前', '性別', '配慮', 'メモ']]
  Object.entries(plan.assignments).forEach(([key, studentId]) => {
    const [row, col] = parseSeatKey(key)
    const student = studentId ? studentsById.get(studentId) : null
    rows.push([
      String(row + 1),
      String(col + 1),
      student?.name ?? '',
      student ? genderLabel(student.gender) : '',
      student ? studentCareLabel(student) : '',
      student?.note ?? '',
    ])
  })
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
}

function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadBinaryFile(filename: string, body: ArrayBuffer, type: string) {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function buildPlanPdf(
  plan: SeatingPlan,
  classroom: Classroom,
  studentsById: Map<string, Student>,
  rosterMode: RosterMode,
): ArrayBuffer {
  const lines = [`席替え 5.5  ${formatDate(plan.createdAt)}`, `score ${Math.round(plan.score)}`]
  for (let row = 0; row < classroom.rows; row += 1) {
    const cells: string[] = []
    for (let col = 0; col < classroom.cols; col += 1) {
      const key = seatKey(row, col)
      const student = studentsById.get(plan.assignments[key] ?? '')
      cells.push(`${row + 1}-${col + 1} ${student ? displayStudentName(student, rosterMode) : '空席'}`)
    }
    lines.push(cells.join('  /  '))
  }
  lines.push(`同席 ${plan.diagnostics.sameSeatRepeats} / 同隣 ${plan.diagnostics.neighborRepeats} / 左右 ${plan.diagnostics.horizontalPairRepeats} / 離席 ${plan.diagnostics.separationViolations ?? 0}`)
  return makeSimpleJapanesePdf(lines)
}

function makeSimpleJapanesePdf(lines: string[]): ArrayBuffer {
  const width = 842
  const height = 595
  const content = lines
    .slice(0, 32)
    .map((line, index) => `BT /F1 ${index === 0 ? 16 : 9} Tf 36 ${height - 42 - index * 16} Td <${toUtf16Hex(line)}> Tj ET`)
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /UniJIS-UCS2-H /DescendantFonts [6 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /FontDescriptor 7 0 R >>',
    '<< /Type /FontDescriptor /FontName /HeiseiKakuGo-W5 /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const encoded = new TextEncoder().encode(pdf)
  const buffer = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(buffer).set(encoded)
  return buffer
}

function toUtf16Hex(value: string): string {
  const bytes = [0xfe, 0xff]
  Array.from(value).forEach((char) => {
    const code = char.charCodeAt(0)
    bytes.push((code >> 8) & 0xff, code & 0xff)
  })
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function cloneClassroom(classroom: Classroom): Classroom {
  return {
    rows: classroom.rows,
    cols: classroom.cols,
    unavailableSeats: classroom.unavailableSeats.slice(),
    fixedAssignments: { ...classroom.fixedAssignments },
  }
}

function normalizeClassroom(classroom: Partial<Classroom>): Classroom {
  const rows = clamp(Math.round(Number(classroom.rows)), 1, 100)
  const cols = clamp(Math.round(Number(classroom.cols)), 1, 100)
  const validSeats = new Set(buildSeatList({ rows, cols }))
  return {
    rows,
    cols,
    unavailableSeats: Array.isArray(classroom.unavailableSeats)
      ? classroom.unavailableSeats.filter((key) => validSeats.has(key))
      : [],
    fixedAssignments: classroom.fixedAssignments
      ? Object.fromEntries(Object.entries(classroom.fixedAssignments).filter(([key, studentId]) => validSeats.has(key) && Boolean(studentId)))
      : {},
  }
}

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
}

function buildMigrationAudit(): MigrationAudit {
  const legacyKeyPresent = localStorage.getItem(LEGACY_STORAGE_KEY) !== null
  const workspaceRaw = localStorage.getItem(STORAGE_KEY)
  let historyCount = 0
  if (workspaceRaw) {
    try {
      const parsed = JSON.parse(workspaceRaw) as Partial<AppState>
      historyCount = Array.isArray(parsed.history) ? parsed.history.length : 0
    } catch {
      historyCount = 0
    }
  }
  const workspaceKeyPresent = workspaceRaw !== null
  const migratedCount = workspaceKeyPresent ? 1 : 0
  const pendingCount = legacyKeyPresent && !workspaceKeyPresent ? 1 : 0
  return {
    checkedAt: new Date().toISOString(),
    legacyKeyPresent,
    workspaceKeyPresent,
    migratedCount,
    pendingCount,
    historyCount,
    note: pendingCount > 0 ? '旧版データが未移行の可能性があります' : 'この端末の移行状態を確認しました',
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function seatLabel(key: string): string {
  const [row, col] = parseSeatKey(key)
  return `${row + 1}行 ${col + 1}列`
}

function rate(value: number, total: number): string {
  if (total === 0) return '-'
  return `${Math.round((value / total) * 100)}%`
}

function percentValue(value: number | undefined, total: number | undefined): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(total) || !total) return null
  return Math.round(((value as number) / (total as number)) * 100)
}

function formatDelta(value: number | null, suffix = ''): string {
  if (value === null) return '-'
  if (value === 0) return `±0${suffix}`
  return `${value > 0 ? '+' : ''}${value}${suffix}`
}

function toneForDelta(value: number | null, better: 'higher' | 'lower'): ComparisonTone {
  if (value === null || value === 0) return 'neutral'
  return better === 'higher' ? (value > 0 ? 'good' : 'bad') : value < 0 ? 'good' : 'bad'
}

function displayStudentName(student: Student, rosterMode: RosterMode): string {
  if (rosterMode === 'attendance') return `${student.attendanceNumber ?? student.name}番`
  return student.name
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function clampRecurrenceDepth(value: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_RECURRENCE_HISTORY_DEPTH
  return clamp(Math.round(numeric), 1, MAX_RECURRENCE_HISTORY_DEPTH)
}

export default App
