// Ejecuta en orden las migraciones SQL pendientes.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../config/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');
await pool.query('create table if not exists _migrations (name text primary key, applied_at timestamptz default now())');
const done = new Set((await pool.query('select name from _migrations')).rows.map(r => r.name));
for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
  if (done.has(f)) continue;
  console.log('aplicando', f);
  await pool.query(await readFile(path.join(dir, f), 'utf8'));
  await pool.query('insert into _migrations(name) values ($1)', [f]);
}
await pool.end();
console.log('migraciones al día');
