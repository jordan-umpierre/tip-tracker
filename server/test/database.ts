import pg from "pg";

const { Client } = pg;

export function poolAdapter(database: pg.Client): Pick<pg.Pool, "connect"> {
  return {
    async connect() {
      return {
        query: database.query.bind(database),
        release: () => undefined,
      } as unknown as pg.PoolClient;
    },
  };
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function withTestDatabase(
  run: (database: pg.Client) => Promise<void>,
) {
  const adminUrl = new URL(process.env.TEST_DATABASE_URL ?? "postgresql://localhost/postgres");
  const databaseName = `tip_tracker_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    const databaseUrl = new URL(adminUrl);
    databaseUrl.pathname = `/${databaseName}`;
    const database = new Client({ connectionString: databaseUrl.toString() });
    await database.connect();

    try {
      await run(database);
    } finally {
      await database.end();
    }
  } finally {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await admin.end();
  }
}
