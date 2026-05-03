import {
  Download,
  FileDown,
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
  type Gender,
  type HeightNeed,
  type RosterMode,
  type SeatingOptions,
  type SeatingPlan,
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

type AlertKind = 'same-seat' | 'neighbor' | 'horizontal' | 'empty' | 'not-generated'

type AlertItem = {
  id: string
  kind: AlertKind
  label: string
  seats: string[]
}

const emptyDraft: StudentDraft = {
  name: '',
  gender: 'boy',
  vision: 'standard',
  height: 'standard',
  note: '',
}

function App() {
  const [initialLoad] = useState(() => loadState())
  const [state, setState] = useState<AppState>(initialLoad.state)
  const [draft, setDraft] = useState<StudentDraft>(emptyDraft)
  const [importText, setImportText] = useState('')
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [swapTargetSeat, setSwapTargetSeat] = useState('')
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
    () => buildAlerts(state.currentPlan, state.history, state.options.historyDepth, state.classroom),
    [state.currentPlan, state.history, state.options.historyDepth, state.classroom],
  )
  const alertSeatMap = useMemo(() => buildAlertSeatMap(alerts), [alerts])
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

  function generate() {
    const result = generateSeatingPlan({
      students: state.students,
      classroom: state.classroom,
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

  function exportStudentsCsv() {
    downloadFile('sekigae-roster.csv', exportRosterCsv(state.students), 'text/csv;charset=utf-8')
    setMessage('名簿CSVを書き出しました')
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
              const alertKind = alertKindForSeat(seatAlerts)
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
                  title={`${row + 1}行 ${col + 1}列${seatAlerts.length > 0 ? ` / 注意: ${seatAlerts.join('、')}` : ''}`}
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
              <button type="button" className="text-button" onClick={exportSeatsCsv}>
                詳細
              </button>
            </div>
            <ComparisonTable rows={comparisonRows} />
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
                <div className={`warning-item ${alert.kind}`} key={alert.id}>
                  <span>{alert.label}</span>
                  {alert.seats.length > 0 ? <small>{formatAlertSeats(alert.seats)}</small> : null}
                </div>
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
            </div>
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

function buildAlertSeatMap(alerts: AlertItem[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  alerts.forEach((alert) => {
    alert.seats.forEach((seat) => {
      const labels = map.get(seat) ?? []
      labels.push(alert.label)
      map.set(seat, labels)
    })
  })
  return map
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

function alertKindForSeat(labels: string[]): AlertKind | null {
  if (labels.length === 0) return null
  if (labels.some((label) => label.includes('同じ席'))) return 'same-seat'
  if (labels.some((label) => label.includes('左右ペア'))) return 'horizontal'
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
  return {
    rosterMode,
    students,
    classroom,
    options,
    currentPlan: candidate.currentPlan ?? history.at(-1) ?? null,
    history,
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
  return pairs.has(left < right ? `${left}|${right}` : `${right}|${left}`)
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
