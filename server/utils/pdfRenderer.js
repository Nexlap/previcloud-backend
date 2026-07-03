const puppeteer = require('puppeteer')
const PQueue = require('p-queue').default

const PDF_QUEUE_CONCURRENCY = 3
const BROWSER_LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']

let browserInstance = null
let browserLaunchPromise = null
const pdfQueue = new PQueue({ concurrency: PDF_QUEUE_CONCURRENCY })

async function launchBrowser() {
  try {
    return await puppeteer.launch({
      headless: true,
      args: BROWSER_LAUNCH_ARGS
    })
  } catch (err) {
    console.error('[pdfRenderer] browser launch fallito, retry:', err.message)
    return await puppeteer.launch({
      headless: true,
      args: BROWSER_LAUNCH_ARGS
    })
  }
}

async function getBrowser() {
  if (browserInstance?.isConnected()) {
    return browserInstance
  }

  if (browserInstance) {
    browserInstance = null
  }

  if (!browserLaunchPromise) {
    browserLaunchPromise = launchBrowser()
      .then((browser) => {
        browserInstance = browser
        browserLaunchPromise = null
        browser.on('disconnected', () => {
          if (browserInstance === browser) {
            browserInstance = null
          }
        })
        return browser
      })
      .catch((err) => {
        browserLaunchPromise = null
        throw err
      })
  }

  return browserLaunchPromise
}

async function renderPdfPage(browser, html) {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 800, height: 1123 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction('window.__preventivoPaginationReady === true', { timeout: 8000 }).catch(() => {})
    return await page.pdf({
      width: '800px',
      height: '1123px',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    })
  } finally {
    await page.close().catch((err) => {
      console.error('[pdfRenderer] page.close fallito:', err.message)
    })
  }
}

async function generaPdfBufferDaHtml(html) {
  const timerLabel = `pdfRenderer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.time(timerLabel)

  const waiting = pdfQueue.size
  if (waiting > 0) {
    console.log(`[pdfRenderer] coda PDF: ${waiting} in attesa (concorrenza max ${PDF_QUEUE_CONCURRENCY})`)
  }

  try {
    return await pdfQueue.add(async () => {
      const browser = await getBrowser()
      return renderPdfPage(browser, html)
    })
  } finally {
    console.timeEnd(timerLabel)
  }
}

async function closeSharedBrowser() {
  if (browserLaunchPromise) {
    try {
      const browser = await browserLaunchPromise
      await browser.close().catch(() => {})
    } catch {
      // launch fallito in corso — niente da chiudere
    }
    browserLaunchPromise = null
  }

  if (browserInstance) {
    await browserInstance.close().catch(() => {})
    browserInstance = null
  }
}

let shutdownHandlersRegistered = false

function registerShutdownHandlers() {
  if (shutdownHandlersRegistered) return
  shutdownHandlersRegistered = true

  const onShutdown = (signal) => {
    console.log(`[pdfRenderer] ${signal} ricevuto, chiusura browser condiviso`)
    closeSharedBrowser().catch((err) => {
      console.error('[pdfRenderer] chiusura browser fallita:', err.message)
    })
  }

  process.once('SIGTERM', () => onShutdown('SIGTERM'))
  process.once('SIGINT', () => onShutdown('SIGINT'))
}

registerShutdownHandlers()

module.exports = { generaPdfBufferDaHtml }
