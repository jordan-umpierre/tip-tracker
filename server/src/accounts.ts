import type pg from "pg";

export type Accounts = ReturnType<typeof createAccounts>;

export function createAccounts(database: pg.Pool | pg.Client) {
  return {
    async findOrCreate(id: string) {
      const result = await database.query<{
        created_at: Date | null;
        deleted: boolean;
        id: string;
      }>(
        `WITH locked AS MATERIALIZED (
           SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
         ), inserted AS (
           INSERT INTO app.accounts (id)
           SELECT $1::uuid FROM locked
           WHERE NOT EXISTS (
             SELECT 1 FROM app.deleted_accounts WHERE account_id = $1::uuid
           )
           ON CONFLICT (id) DO NOTHING
           RETURNING id, created_at
         )
         SELECT id, created_at, false AS deleted FROM inserted
         UNION ALL
         SELECT id, created_at, false AS deleted
         FROM app.accounts WHERE id = $1::uuid
         UNION ALL
         SELECT $1::uuid, NULL, true
         FROM app.deleted_accounts WHERE account_id = $1::uuid
         LIMIT 1`,
        [id],
      );
      if (!result.rows[0]) throw new Error("Account disappeared while being read");
      return result.rows[0];
    },

    async isDeleted(id: string) {
      const result = await database.query(
        "SELECT 1 FROM app.deleted_accounts WHERE account_id = $1::uuid",
        [id],
      );
      return result.rowCount === 1;
    },

    async markDeleted(id: string) {
      await database.query(
        `WITH locked AS MATERIALIZED (
           SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
         ), tombstone AS (
           INSERT INTO app.deleted_accounts (account_id)
           SELECT $1::uuid FROM locked
           ON CONFLICT (account_id) DO NOTHING
         )
         DELETE FROM app.accounts WHERE id = $1::uuid`,
        [id],
      );
    },
  };
}
