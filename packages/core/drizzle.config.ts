import { defineConfig } from 'drizzle-kit';

// DATABASE_URL defaults to the docker-compose dev database (dev-only credentials, see docker-compose.yml).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://miara:miara@localhost:5433/miara' },
});
