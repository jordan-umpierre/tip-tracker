import type pg from "pg";

export type Accounts = ReturnType<typeof createAccounts>;

export function createAccounts(database: pg.Pool | pg.Client) {
  return {
    async findOrCreate(id: string) {
      await database.query(
        "INSERT INTO app.accounts (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
        [id],
      );
      const result = await database.query<{ created_at: Date; id: string }>(
        "SELECT id, created_at FROM app.accounts WHERE id = $1",
        [id],
      );
      if (!result.rows[0]) throw new Error("Account disappeared while being read");
      return result.rows[0];
    },

    async delete(id: string) {
      await database.query("DELETE FROM app.accounts WHERE id = $1", [id]);
    },
  };
}
