import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
const publicRepo = process.env.SEKIGAE_PUBLIC_DIR
  ? path.resolve(process.env.SEKIGAE_PUBLIC_DIR)
  : path.resolve(root, '..', 'sekigae')

const checks = []

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
}

check('dist:index', fs.existsSync(path.join(dist, 'index.html')))
check('public-repo:git', fs.existsSync(path.join(publicRepo, '.git')))
check('public-repo:index', fs.existsSync(path.join(publicRepo, 'index.html')))

if (fs.existsSync(path.join(dist, 'index.html')) && fs.existsSync(path.join(publicRepo, 'index.html'))) {
  const sourceIndex = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  const publicIndex = fs.readFileSync(path.join(publicRepo, 'index.html'), 'utf8')
  check('dist:sekigae-base', sourceIndex.includes('/sekigae/'), 'dist must be built with VITE_BASE_PATH=/sekigae/')

  const assets = Array.from(sourceIndex.matchAll(/\/sekigae\/assets\/([^"']+)/g), (match) => match[1])
  check('dist:assets-found', assets.length > 0, assets.join(', '))
  for (const asset of assets) {
    check(`public-index:${asset}`, publicIndex.includes(`/sekigae/assets/${asset}`))
    check(`public-asset:${asset}`, fs.existsSync(path.join(publicRepo, 'assets', asset)))
  }
}

const failed = checks.filter((item) => !item.ok)
const summary = {
  status: failed.length === 0 ? 'ok' : 'failed',
  publicRepo,
  checks: checks.length,
  failed,
}

console.log(JSON.stringify(summary, null, 2))

if (failed.length > 0) process.exitCode = 1
