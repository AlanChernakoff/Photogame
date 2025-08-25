import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { customAlphabet } from 'nanoid'
import { execSync } from 'child_process'
import pool from './db.js'   // 🔹 conexión a Postgres

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = parseInt(process.env.PORT || '8000', 10)
const UPLOAD_DIR = process.env.UPLOAD_DIR || '.hidden_uploads'

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
ensureDirHidden(UPLOAD_DIR)

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
app.post('/api/users/register', async (req, res) => {
  const { name, color } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  if (!color) return res.status(400).json({ error: 'color required' })

  try {
    const existe = await pool.query(
      'SELECT * FROM users WHERE LOWER(name) = LOWER($1)',
      [name]
    )
    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'user already exists' })
    }

    const count = await pool.query('SELECT COUNT(*) FROM users')
    const role = parseInt(count.rows[0].count, 10) === 0 ? 'admin' : 'host'

    const result = await pool.query(
      'INSERT INTO users (name, role, color) VALUES ($1, $2, $3) RETURNING *',
      [name, role, color]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'db error' })
  }
})

app.get('/api/users', async (_req, res) => {
  const result = await pool.query('SELECT * FROM users ORDER BY id')
  res.json(result.rows)
})

app.post('/api/users/login', async (req, res) => {
  const { name, color } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  if (!color) return res.status(400).json({ error: 'color required' })

  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(name) = LOWER($1)',
    [name]
  )
  const u = result.rows[0]
  if (!u) return res.status(404).json({ error: 'not found' })
  if (u.color !== color) return res.status(400).json({ error: 'invalid color' })
  res.json(u)
})

// ---------- PHOTOS ----------
app.post('/api/upload', upload.fields([
  { name: 'chico', maxCount: 1 },
  { name: 'vergonzosa', maxCount: 1 }
]), async (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  if (!userId) return res.status(400).json({ error: 'userId query required' })

  const user = await pool.query('SELECT * FROM users WHERE id=$1', [userId])
  if (user.rows.length === 0) return res.status(404).json({ error: 'user not found' })

  const files = req.files || {}
  if (!files['chico'] && !files['vergonzosa']) {
    return res.status(400).json({ error: 'no files' })
  }

  const existing = await pool.query('SELECT COUNT(*) FROM photos WHERE owner_id=$1', [userId])
  const cantActual = parseInt(existing.rows[0].count, 10)
  const newCount = (files['chico'] ? 1 : 0) + (files['vergonzosa'] ? 1 : 0)
  if (cantActual + newCount > 2) {
    for (const key of Object.keys(files)) {
      for (const f of files[key]) fs.unlinkSync(f.path)
    }
    return res.status(400).json({ error: 'max 2 photos per user' })
  }

  const added = []
  if (files['chico']) {
    const f = files['chico'][0]
    markHiddenWin(f.path)
    await pool.query(
      'INSERT INTO photos (owner_id, tipo, filename, created_at) VALUES ($1,$2,$3,$4)',
      [userId, 'chico', path.basename(f.path), new Date().toISOString()]
    )
    added.push('chico')
  }
  if (files['vergonzosa']) {
    const f = files['vergonzosa'][0]
    markHiddenWin(f.path)
    await pool.query(
      'INSERT INTO photos (owner_id, tipo, filename, created_at) VALUES ($1,$2,$3,$4)',
      [userId, 'vergonzosa', path.basename(f.path), new Date().toISOString()]
    )
    added.push('vergonzosa')
  }

  res.json({ ok: true, added })
})

app.get('/api/my-photos', async (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  const result = await pool.query('SELECT * FROM photos WHERE owner_id=$1 ORDER BY id', [userId])
  const fotos = result.rows.map(p => ({
    id: p.id,
    ownerId: p.owner_id,
    tipo: p.tipo,
    filename: p.filename,
    createdAt: p.created_at
  }))
  res.json(fotos)
})

app.get('/api/photos', async (_req, res) => {
  const result = await pool.query('SELECT * FROM photos ORDER BY owner_id, id')
  const fotos = result.rows.map(p => ({
    id: p.id,
    ownerId: p.owner_id,
    tipo: p.tipo,
    filename: p.filename,
    createdAt: p.created_at
  }))
  res.json(fotos)
})

app.delete('/api/photos/:id', async (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const user = await pool.query('SELECT * FROM users WHERE id=$1', [userId])
  if (user.rows.length === 0) return res.status(404).json({ error: 'user not found' })

  const photoRes = await pool.query('SELECT * FROM photos WHERE id=$1', [req.params.id])
  const photo = photoRes.rows[0]
  if (!photo) return res.status(404).json({ error: 'not found' })

  const userData = user.rows[0]
  // 🔹 regla clara: admin borra todo, host solo lo suyo
  if (userData.role !== 'admin' && photo.owner_id !== userId) {
    return res.status(403).json({ error: 'not authorized' })
  }

  const filePath = path.join(UPLOAD_DIR, photo.filename)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  await pool.query('DELETE FROM photos WHERE id=$1', [req.params.id])

  res.json({ ok: true })
})

app.get('/debug/users', async (_req, res) => {
  const result = await pool.query('SELECT * FROM users ORDER BY id')
  res.json(result.rows)
})

app.get('/debug/photos', async (_req, res) => {
  const result = await pool.query('SELECT * FROM photos ORDER BY id')
  res.json(result.rows)
})

// ⚠️ SOLO USO ADMIN — Borrar usuario por id
app.get('/debug/delete-user/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!id) return res.status(400).json({ error: 'id inválido' })

    // Primero borramos sus fotos (para evitar huérfanos)
    await pool.query('DELETE FROM photos WHERE owner_id=$1', [id])

    // Luego borramos el usuario
    const result = await pool.query('DELETE FROM users WHERE id=$1 RETURNING *', [id])

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'usuario no encontrado' })
    }

    res.json({ ok: true, deleted: result.rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'db error' })
  }
})

// ---------- COLORS ----------
app.get('/api/colors', (_req, res) => {
  const colorsPath = path.join(__dirname, 'data', 'colors.json')
  if (!fs.existsSync(colorsPath)) {
    return res.status(500).json({ error: 'colors.json not found' })
  }
  const json = JSON.parse(fs.readFileSync(colorsPath, 'utf8'))
  res.json(json)
})

// ---------- FRONT ----------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`)
})
