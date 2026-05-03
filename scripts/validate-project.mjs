import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const requiredFiles = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'TASKS.md',
  'docs/PROJECT_PLAN.md',
  'docs/AI_DLC.md',
  'docs/DESIGN.md',
  'docs/PRIVACY.md',
  'docs/VALIDATION_REPORT.md',
  'history/2026-05-03-initial-build.md',
  'src/lib/seating.ts',
  'src/lib/seating.test.ts',
  'src/App.test.tsx',
  '.github/workflows/pages.yml',
]

const checks = []

function assertCheck(name, ok, detail = '') {
  checks.push({ name, ok, detail })
}

for (const file of requiredFiles) {
  assertCheck(`required:${file}`, fs.existsSync(path.join(root, file)))
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const script of ['lint', 'test', 'harness', 'smoke:ui', 'verify', 'verify:sekigae', 'build']) {
  assertCheck(`script:${script}`, Boolean(packageJson.scripts?.[script]))
}

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
assertCheck('gitignore:.env', /^\.env$/m.test(gitignore))
assertCheck('gitignore:env-example-allowed', /^!\.env\.example$/m.test(gitignore))

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
for (const token of ['席替え', 'localStorage', 'GitHub Pages', '検証']) {
  assertCheck(`readme:${token}`, readme.includes(token))
}

const plan = fs.readFileSync(path.join(root, 'docs/PROJECT_PLAN.md'), 'utf8')
for (const token of ['目的', '前提', '完了条件', 'タスク']) {
  assertCheck(`plan:${token}`, plan.includes(token))
}

const aiDlc = fs.readFileSync(path.join(root, 'docs/AI_DLC.md'), 'utf8')
for (const token of ['規約', 'スキル', 'フック', 'エージェント', 'サンドボックス', '公開前チェック']) {
  assertCheck(`ai-dlc:${token}`, aiDlc.includes(token))
}

const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
for (const token of ['data-testid="generate-button"', 'window.print()', 'exportPlanCsv', 'localStorage']) {
  assertCheck(`app:${token}`, appSource.includes(token))
}
for (const token of ['SeparationRuleEditor', 'buildPlanPdf', 'MigrationStatus', 'AlertDetailPanel']) {
  assertCheck(`app:backlog:${token}`, appSource.includes(token))
}

assertCheck('required:scripts/verify-sekigae-reflection.mjs', fs.existsSync(path.join(root, 'scripts/verify-sekigae-reflection.mjs')))

const failed = checks.filter((check) => !check.ok)
const summary = {
  status: failed.length === 0 ? 'ok' : 'failed',
  checks: checks.length,
  failed,
}

console.log(JSON.stringify(summary, null, 2))

if (failed.length > 0) {
  process.exitCode = 1
}
