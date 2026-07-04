require('./server/instrument')

const express = require('express')
const cors = require('cors')
const Sentry = require('@sentry/node')
require('./server/config')

const chatRoutes = require('./server/routes/chat')
const pdfRoutes = require('./server/routes/pdf')
const clientiRoutes = require('./server/routes/clienti')
const profiloRoutes = require('./server/routes/profilo')
const varieRoutes = require('./server/routes/varie')
const analyticsRoutes = require('./server/routes/analytics')
const accountRoutes = require('./server/routes/account')
const firmaRoutes = require('./server/routes/firma')
const stripeConnectRoutes = require('./server/routes/stripeConnect')
const cronRoutes = require('./server/routes/cron')

const app = express()
app.set('trust proxy', 1)
const ALLOWED_ORIGINS = [
  'https://previcloud.it',
  'https://www.previcloud.it',
  'https://previcloud-web.vercel.app',
  'https://preventivoai-web.vercel.app', // transizione — rimuovere dopo cutover
  'http://localhost:1420',      // Tauri dev
  'http://localhost:3000',      // Next.js dev
  'tauri://localhost',          // Tauri produzione
  'https://tauri.localhost',    // Tauri produzione alternativo
  'http://tauri.localhost',     // Tauri produzione Windows
]

app.use(cors({
  origin: (origin, callback) => {
    // Permetti richieste senza origin (mobile nativo, curl, Railway health check)
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    callback(new Error(`CORS bloccato: origine non permessa — ${origin}`))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
app.use(stripeConnectRoutes.webhookRouter)
app.use(express.json({ limit: '50mb' }))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use(chatRoutes)
app.use(pdfRoutes)
app.use(clientiRoutes)
app.use(profiloRoutes)
app.use(varieRoutes)
app.use(analyticsRoutes)
app.use(accountRoutes)
app.use(firmaRoutes)
app.use(stripeConnectRoutes)
app.use(cronRoutes)

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app)
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Errore interno' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`✅ PreventivoAI backend attivo su porta ${PORT}`)
})

// v2.1
