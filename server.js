// Servidor local de desenvolvimento. Em produção (Vercel) o app roda em api/index.js.
// Sem DATABASE_URL, usa Postgres embutido (PGlite) em ./data/pg.
const app = require('./src/app');
const db = require('./src/db');

const PORT = process.env.PORT || 3000;

(async () => {
  if (process.argv.includes('--reset')) { await db.reset(); console.log('Banco zerado.'); }
  await db.ready();
  console.log(`Banco: ${db.getDriver().kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'PGlite local (data/pg)'}`);
  app.listen(PORT, () => console.log(`MG-TRACK rodando em http://localhost:${PORT}`));
})().catch(e => { console.error(e); process.exit(1); });
