import pool from './db.js';

async function init() {
  try {
    // Crear tabla users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        color TEXT
      );
    `);

    // Crear tabla photos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL,
        filename TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Crear tabla game
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game (
        id SERIAL PRIMARY KEY,
        status TEXT NOT NULL,
        "order" INT[] NOT NULL,
        index INT NOT NULL,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
      );
    `);

    console.log("✅ Tablas creadas correctamente");
  } catch (err) {
    console.error("❌ Error creando tablas:", err);
  } finally {
    pool.end();
  }
}

init();
