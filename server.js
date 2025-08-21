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

const PORT = parseInt(process.env.PORT || '4000', 10)
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
  if (!fs.existsSync(DATA_FILE)) return { users: [], photos: [], game: { status: 'waiting', order: [], index: 0 } }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }
  catch { return { users: [], photos: [], game: { status: 'waiting', order: [], index: 0 } } }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}
// init
ensureDirHidden(UPLOAD_DIR)
if (!fs.existsSync(DATA_FILE)) saveData({ users: [], photos: [], game: { status: 'waiting', order: [], index: 0 } })

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
    if (!ok) return cb(new Error('Only jpg/png/webp allowed'))
    cb(null, true)
  }
})

// ---------- App ----------
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Static frontend
app.use(express.static(path.join(__dirname, 'public')))

// API: health
app.get('/health', (_req, res) => res.json({ ok: true }))

// ---------- USERS ----------

// Register
app.post('/api/users/register', (req, res) => {
  const { name } = req.body || {}
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' })

  const data = loadData()
  if (data.users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'user already exists, please login' })
  }

  const role = data.users.length === 0 ? 'admin' : 'host'
  const id = (data.users.at(-1)?.id || 0) + 1
  const user = { id, name, role, createdAt: new Date().toISOString() }
  data.users.push(user)
  saveData(data)
  res.json(user)
})

// Login
app.post('/api/users/login', (req, res) => {
  const { name } = req.body || {}
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' })

  const data = loadData()
  const user = data.users.find(u => u.name.toLowerCase() === name.toLowerCase())
  if (!user) return res.status(404).json({ error: 'user not found, please register first' })

  res.json(user)
})

// Get user by id
app.get('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const data = loadData()
  const u = data.users.find(x => x.id === id)
  if (!u) return res.status(404).json({ error: 'not found' })
  res.json(u)
})

// ---------- UPLOAD ----------

app.post('/api/upload', upload.array('files', 2), (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  if (!userId) return res.status(400).json({ error: 'userId query required' })

  const data = loadData()
  const user = data.users.find(u => u.id === userId)
  if (!user) return res.status(404).json({ error: 'user not found' })

  if (user.role !== 'host' && user.role !== 'admin') {
    return res.status(403).json({ error: 'only hosts or admins can upload' })
  }

  const files = req.files || []
  if (files.length === 0) return res.status(400).json({ error: 'no files' })

  const existing = data.photos.filter(p => p.ownerId === userId).length
  if (existing + files.length > 2) {
    for (const f of files) fs.existsSync(f.path) && fs.unlinkSync(f.path)
    return res.status(400).json({ error: 'max 2 photos per user' })
  }

  for (const f of files) {
    markHiddenWin(f.path)
    data.photos.push({
      id: (data.photos.at(-1)?.id || 0) + 1,
      ownerId: userId,
      filename: path.basename(f.path),
      mime: f.mimetype,
      size: f.size,
      createdAt: new Date().toISOString()
    })
  }

  saveData(data)
  res.json({ ok: true, added: files.length })
})

// ---------- GAME ----------

function requireAdmin(req, res) {
  const adminId = parseInt(req.query.userId, 10)
  if (!adminId) { res.status(400).json({ error: 'userId (admin) required' }); return null }
  const data = loadData()
  const u = data.users.find(x => x.id === adminId)
  if (!u) { res.status(404).json({ error: 'admin not found' }); return null }
  if (u.role !== 'admin') { res.status(403).json({ error: 'admin only' }); return null }
  return { data, admin: u }
}

// Start game
app.post('/api/game/start', (req, res) => {
  const ctx = requireAdmin(req, res); if (!ctx) return
  const { data } = ctx
  const ids = data.photos.map(p => p.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  data.game = { status: 'running', order: ids, index: 0, startedAt: new Date().toISOString(), finishedAt: null }
  saveData(data)
  res.json({ ok: true, total: ids.length })
})

// Next photo
app.get('/api/game/next', (req, res) => {
  const ctx = requireAdmin(req, res); if (!ctx) return
  const { data } = ctx
  if (data.game.status !== 'running') return res.json({ done: true, message: 'Game Over' })
  const order = data.game.order || []
  const idx = data.game.index || 0
  if (idx >= order.length) {
    data.game.status = 'finished'
    data.game.finishedAt = new Date().toISOString()
    saveData(data)
    return res.json({ done: true, message: 'Game Over' })
  }
  const photoId = order[idx]
  data.game.index = idx + 1
  saveData(data)
  res.json({ done: false, photoId, remaining: order.length - (idx + 1) })
})

// Status
app.get('/api/game/status', (req, res) => {
  const ctx = requireAdmin(req, res); if (!ctx) return
  const { data } = ctx
  const total = Array.isArray(data.game.order) ? data.game.order.length : 0
  res.json({ status: data.game.status, index: data.game.index, total })
})

// ---------- USERS BY NAME ----------
app.get('/api/users/by-name', (req, res) => {
  const { name } = req.query
  if (!name) return res.status(400).json({ error: 'name required' })

  const data = loadData()
  const u = data.users.find(x => x.name.toLowerCase() === name.toLowerCase())
  if (!u) return res.status(404).json({ error: 'user not found, please register first' })
  res.json(u)
})

// ---------- IMAGES ----------
app.get('/api/image/:photoId', (req, res) => {
  const ctx = requireAdmin(req, res); if (!ctx) return
  const { data } = ctx
  if (data.game.status !== 'running') return res.status(403).json({ error: 'game not running' })

  const id = parseInt(req.params.photoId, 10)
  const photo = data.photos.find(p => p.id === id)
  if (!photo) return res.status(404).json({ error: 'not found' })
  const filePath = path.join(UPLOAD_DIR, photo.filename)
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'file missing' })
  res.setHeader('Content-Type', photo.mime)
  fs.createReadStream(filePath).pipe(res)
})

// Delete ONE photo
app.delete('/api/photos/:photoId', (req, res) => {
  const ctx = requireAdmin(req, res); if (!ctx) return;
  const { data } = ctx;

  const id = parseInt(req.params.photoId, 10);
  const photoIndex = data.photos.findIndex(p => p.id === id);
  if (photoIndex === -1) return res.status(404).json({ error: 'not found' });

  const photo = data.photos[photoIndex];
  const filePath = path.join(UPLOAD_DIR, photo.filename);

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  data.photos.splice(photoIndex, 1);
  saveData(data);

  res.json({ ok: true, deletedId: id });
});

// Delete ALL photos
app.delete('/api/photos', (req, res) => {
  const ctx = requireAdmin(req, res); if (!ctx) return;
  const { data } = ctx;

  // borrar todos los archivos
  for (const p of data.photos) {
    const filePath = path.join(UPLOAD_DIR, p.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.error("Error borrando", filePath, e); }
    }
  }

  // vaciar el array
  data.photos = [];
  saveData(data);

  res.json({ ok: true, message: "Todas las fotos eliminadas" });
});

// ---------- Fallback ----------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`App listening on http://localhost:${PORT}`)
  console.log(`Upload dir: ${path.resolve(UPLOAD_DIR)} (hidden on Windows)`)
})
