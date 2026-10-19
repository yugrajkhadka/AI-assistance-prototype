// Full report PDF: prints the web app's /report/:projectId page with Chrome, so
// the PDF matches what the AI Analysis Dashboard and Generated Outputs show.
//
// Uses the Chrome already installed on the machine (puppeteer-core downloads
// nothing). Configure with:
//   CHROME_PATH       path to Chrome/Chromium if it isn't in a standard place
//   REPORT_BASE_URL   where the web app is served (default: local Vite dev server)
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

// Layout widths per orientation (match the report page's preview). Pages keep A4
// proportions (1 : √2) so they print onto A4 without distortion.
const PAGE_WIDTH_PX = { landscape: 1320, portrait: 1040 }
const REPORT_BASE_URL = process.env.REPORT_BASE_URL || 'http://localhost:5173/AI-assistance-prototype/'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

export function findChrome() {
  return CHROME_CANDIDATES.find((path) => existsSync(path)) || null
}

// One report at a time keeps memory bounded on small machines.
let queue = Promise.resolve()

export function renderReportPdf(projectId, options = {}) {
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape'
  const theme = options.theme === 'light' ? 'light' : 'dark'
  const run = queue.then(() => render(projectId, { orientation, theme }))
  queue = run.catch(() => {})
  return run
}

async function render(projectId, { orientation, theme }) {
  const width = PAGE_WIDTH_PX[orientation]
  const height = orientation === 'portrait' ? Math.round(width * Math.SQRT2) : Math.round(width / Math.SQRT2)
  const executablePath = findChrome()
  if (!executablePath) {
    const err = new Error('No Chrome/Chromium found for PDF export — set CHROME_PATH in server/.env')
    err.status = 501
    throw err
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height })
    await page.emulateMediaType('print')
    const url = `${REPORT_BASE_URL.replace(/\/?$/, '/')}#/report/${encodeURIComponent(projectId)}?orientation=${orientation}&theme=${theme}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // The page flips this once data, fonts and every storyboard image have rendered.
    await page.waitForFunction('window.__REPORT_READY__ === true', { timeout: 90000, polling: 250 })
    const failed = await page.evaluate(() => document.body.innerText.includes("Couldn't load the report"))
    if (failed) throw new Error('The report page could not load this project')
    // The page's own @page rule says A4 (for the browser-print fallback); override it
    // with the pixel page size, or Chrome lays out on A4 and leaves a white frame.
    await page.addStyleTag({ content: `@page { size: ${width}px ${height}px; margin: 0; }` })
    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: false,
      width: `${width}px`,
      height: `${height}px`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
  } finally {
    await browser.close()
  }
}
