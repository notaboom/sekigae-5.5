import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const root = process.cwd()
const port = Number(process.env.SMOKE_PORT ?? 4176)
const url = `http://127.0.0.1:${port}/`
const outputDir = path.join(root, 'output', 'playwright')

await fs.mkdir(outputDir, { recursive: true })

const serverCommand = process.platform === 'win32' ? 'cmd.exe' : 'npm'
const serverArgs =
  process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm.cmd run dev -- --host 127.0.0.1 --port ${port}`]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)]

const server = spawn(serverCommand, serverArgs, {
  cwd: root,
  stdio: 'ignore',
  windowsHide: true,
})

let browser
try {
  await waitForServer(url, 25_000)

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.setDefaultTimeout(10_000)
  page.setDefaultNavigationTimeout(15_000)
  const consoleMessages = []
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`))

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByTestId('generate-button').click()
  await page.getByText('席替えを生成しました').waitFor()
  await page.screenshot({ path: path.join(outputDir, 'sekigae-home.png'), fullPage: true })

  const tileCount = await page.locator('.seat-tile').count()
  const firstStudentVisible = await page.getByText('あおい').count()
  await browser.close()
  browser = undefined

  if (tileCount < 20) throw new Error(`seat tile count is too small: ${tileCount}`)
  if (firstStudentVisible < 1) throw new Error('default roster did not render')
  if (consoleMessages.length > 0) throw new Error(consoleMessages.join('\n'))

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        url,
        tileCount,
        screenshot: 'output/playwright/sekigae-home.png',
      },
      null,
      2,
    ),
  )
} finally {
  if (browser) await browser.close().catch(() => undefined)
  await stopServer(server)
}

async function waitForServer(targetUrl, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_000)
    try {
      const response = await fetch(targetUrl, { signal: controller.signal })
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`server did not start: ${targetUrl}`)
}

async function stopServer(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.on('exit', resolve)
      killer.on('error', resolve)
    })
    return
  }
  child.kill('SIGTERM')
}
