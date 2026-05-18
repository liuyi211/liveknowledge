require('dotenv').config();
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL || 'postgres://lk:lk_password@localhost:5432/liveknowledge');

async function main() {
  const migrations = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5`;
  console.log('Migrations:', migrations);

  const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'notes' ORDER BY ordinal_position`;
  console.log('Notes columns:', columns.map(c => c.column_name));

  await sql.end();
}

main().catch(console.error);
