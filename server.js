import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { customAlphabet } from 'nanoid'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = parseInt(process.env.PORT || '8000', 10)
const UPLOAD_DIR = process.env.UPLOAD_DIR || '.hidden_uploads'
const DATA_FILE = process.env.DATA_FILE || path.join(UPLOAD_DIR, 'data.json')

// ---------- Helpers ----------
function ensureDirHidden(dir) {
  fs.mkdirSync(dir, { recursive: true })
  if (process.platform === 'win32') {
    try { execSync(`attrib +h "${dir}"`) } catch {}
  }
}
function markHiddenWin(filePath) {
  if (process.platform === 'win32') {
    try { execSync(`attrib +h "${filePath}"`) } catch {}
  }
}
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { users: [], photos: [] }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }
  catch { return { users: [], photos: [] } }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}
ensureDirHidden(UPLOAD_DIR)
if (!fs.existsSync(DATA_FILE)) saveData({ users: [], photos: [] })

// ---------- Multer ----------
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `photo_${nanoid()}${path.extname(file.originalname) || '.jpg'}`)
})
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp'].includes(file.mimetype)
    if (!ok) return cb(new Error('Solo jpg/png/webp'))
    cb(null, true)
  }
})

// ---------- App ----------
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))
app.use('/uploads', express.static(path.join(__dirname, '.hidden_uploads')))

app.get('/health', (_req, res) => res.json({ ok: true }))

// ---------- USERS ----------
app.post('/api/users/register', (req, res) => {
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })

  const data = loadData()
  if (data.users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'user already exists' })
  }
  const role = data.users.length === 0 ? 'admin' : 'host'
  const id = (data.users.at(-1)?.id || 0) + 1
  const user = { id, name, role }
  data.users.push(user)
  saveData(data)
  res.json(user)
})

app.post('/api/users/login', (req, res) => {
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  const data = loadData()
  const u = data.users.find(x => x.name.toLowerCase() === name.toLowerCase())
  if (!u) return res.status(404).json({ error: 'not found' })
  res.json(u)
})

// ---------- PHOTOS ----------
app.post('/api/upload', upload.array('files', 2), (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  if (!userId) return res.status(400).json({ error: 'userId query required' })

  const data = loadData()
  const user = data.users.find(u => u.id === userId)
  if (!user) return res.status(404).json({ error: 'user not found' })

  const files = req.files || []
  if (files.length === 0) return res.status(400).json({ error: 'no files' })

  const existing = data.photos.filter(p => p.ownerId === userId).length
  if (existing + files.length > 2) {
    for (const f of files) fs.unlinkSync(f.path)
    return res.status(400).json({ error: 'max 2 photos per user' })
  }

  for (const f of files) {
    markHiddenWin(f.path)
    data.photos.push({
      id: (data.photos.at(-1)?.id || 0) + 1,
      ownerId: userId,
      filename: path.basename(f.path),
      createdAt: new Date().toISOString()
    })
  }
  saveData(data)
  res.json({ ok: true })
})

// fotos propias
app.get('/api/my-photos', (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  const data = loadData()
  const fotos = data.photos.filter(p => p.ownerId === userId)
  res.json(fotos)
})

// todas las fotos (admin)
app.get('/api/photos', (req, res) => {
  const data = loadData()
  res.json(data.photos)
})

// borrar
app.delete('/api/photos/:id', (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const data = loadData()
  const user = data.users.find(u => u.id === userId)
  if (!user) return res.status(404).json({ error: 'user not found' })

  const id = parseInt(req.params.id, 10)
  const idx = data.photos.findIndex(p => p.id === id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })

  const photo = data.photos[idx]
  if (user.role !== 'admin' && photo.ownerId !== userId) {
    return res.status(403).json({ error: 'not authorized' })
  }

  const filePath = path.join(UPLOAD_DIR, photo.filename)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  data.photos.splice(idx, 1)
  saveData(data)
  res.json({ ok: true })
})

// ---------- FRONT ----------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`)
})
