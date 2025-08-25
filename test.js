import pool from './db.js';

async function test() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log("✅ Conectado! Hora en la DB:", result.rows[0].now);
  } catch (err) {
    console.error("❌ Error conectando:", err);
  } finally {
    pool.end();
  }
}

test();
