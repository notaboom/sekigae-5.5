import { describe, expect, it } from 'vitest'
import { migrateLegacyState } from './legacyMigration'

describe('migrateLegacyState', () => {
  it('converts old sekigae localStorage data into the 5.5 workspace shape', () => {
    const legacy = {
      students: [
        { id: 's1', name: 'あおい', gender: 'girl', vision: 'poor', height: 'normal', notes: '黒板が見えにくい' },
        { id: 's2', name: 'はると', gender: 'boy', vision: 'normal', height: 'tall', notes: '' },
      ],
      rows: 1,
      cols: 2,
      blocked: [],
      fixedMap: { '0-0': 's1' },
      history: [
        {
          id: 'old-plan',
          title: '旧席替え',
          createdAt: '2026-05-01T00:00:00.000Z',
          rows: 1,
          cols: 2,
          grid: [['s1', 's2']],
          pairs: ['s1|s2'],
          score: 10,
        },
      ],
      current: {
        id: 'current-plan',
        title: '現在',
        createdAt: '2026-05-02T00:00:00.000Z',
        rows: 1,
        cols: 2,
        grid: [['s1', 's2']],
        pairs: ['s1|s2'],
        score: 5,
      },
      options: {
        trials: 80,
        hillSteps: 120,
        historyWindow: 6,
        visionWeight: 3,
        heightWeight: 1,
        sameSeatPenalty: 7,
        sameNeighborPenalty: 6,
        clusterPenalty: 2,
        preferMixedGender: true,
        genderMixWeight: 3,
      },
    }

    const migrated = migrateLegacyState(legacy)

    expect(migrated).toBeTruthy()
    expect(migrated?.rosterMode).toBe('name')
    expect(migrated?.students[0]).toMatchObject({ id: 's1', name: 'あおい', gender: 'girl', vision: 'front' })
    expect(migrated?.students[1]).toMatchObject({ id: 's2', height: 'back' })
    expect(migrated?.classroom).toMatchObject({ rows: 1, cols: 2, fixedAssignments: { '0-0': 's1' } })
    expect(migrated?.options).toMatchObject({ trials: 80, improvementSteps: 120, preferGenderMix: true })
    expect(migrated?.currentPlan?.assignments).toEqual({ '0-0': 's1', '0-1': 's2' })
    expect(migrated?.currentPlan?.diagnostics.sameSeatRepeats).toBe(2)
    expect(migrated?.currentPlan?.diagnostics.neighborRepeats).toBe(1)
  })
})
