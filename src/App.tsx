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
  DEFAULT_OPTIONS,
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

const HISTORY_LIMIT = 24
const CLASSROOM_SIZE_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1)

type StudentDraft = {
  name: string
  gender: Gender
  vision: VisionNeed
  height: HeightNeed
  note: string
}

const emptyDraft: StudentDraft = {
  name: '',
  gender: 'boy',
  vision: 'standard',
  height: 'standard',
  note: '',
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [draft, setDraft] = useState<StudentDraft>(emptyDraft)
  const [importText, setImportText] = useState('')
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [swapTargetSeat, setSwapTargetSeat] = useState('')
  const [message, setMessage] = useState('準備完了')
  const importFileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const seats = useMemo(() => buildSeatList(state.classroom), [state.classroom])
  const unavailable = useMemo(() => new Set(state.classroom.unavailableSeats), [state.classroom.unavailableSeats])
  const studentsById = useMemo(() => new Map(state.students.map((student) => [student.id, student])), [state.students])
  const previousPlan = useMemo(() => findPreviousPlan(state.currentPlan, state.history), [state.currentPlan, state.history])
  const previousHorizontalPairs = useMemo(() => new Set(previousPlan?.horizontalPairs ?? []), [previousPlan])
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

          <div
            className="seat-grid"
            style={{ gridTemplateColumns: `repeat(${state.classroom.cols}, minmax(72px, 1fr))` }}
            data-testid="seat-grid"
          >
            {seats.map((key) => {
              const [row, col] = parseSeatKey(key)
              const studentId = state.currentPlan?.assignments[key] ?? state.classroom.fixedAssignments[key] ?? null
              const student = studentId ? studentsById.get(studentId) : null
              const blocked = unavailable.has(key)
              const fixed = Boolean(state.classroom.fixedAssignments[key])
              const repeatedHorizontal = isHorizontalRepeat(key, state.currentPlan, previousHorizontalPairs)
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
                    student?.gender === 'boy' ? 'boy' : '',
                    student?.gender === 'girl' ? 'girl' : '',
                  ].join(' ')}
                  onClick={() => selectSeat(key)}
                  title={`${row + 1}行 ${col + 1}列`}
                >
                  <span className="seat-index">
                    {row + 1}-{col + 1}
                  </span>
                  <strong>{blocked ? '使用不可' : student ? displayStudentName(student, state.rosterMode) : '空席'}</strong>
                  <span>{student ? studentCareLabel(student) || genderLabel(student.gender) : fixed ? '固定' : ''}</span>
                  {fixed ? <Lock className="seat-lock" size={13} aria-hidden="true" /> : null}
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

        <aside className="rail">
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
            <OptionSlider
              label="履歴"
              value={state.options.historyDepth}
              min={1}
              max={24}
              step={1}
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

function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createInitialState()
  try {
    return coerceState(JSON.parse(raw) as AppState)
  } catch {
    return createInitialState()
  }
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

function displayStudentName(student: Student, rosterMode: RosterMode): string {
  if (rosterMode === 'attendance') return `${student.attendanceNumber ?? student.name}番`
  return student.name
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export default App
