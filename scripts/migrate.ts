// Furkan Kaan Ünal — 2024502225
import { createDb, migrate } from "../src/db.ts";
import { loadConfig } from "../src/config.ts";
const config = loadConfig();
const database = createDb(
  config.DATABASE_URL,
  config.POOL_SIZE,
  config.DATABASE_AUTH_TOKEN,
);
try {
  await migrate(database);
  console.log("Migrations applied.");
} finally {
  database.close();
}
