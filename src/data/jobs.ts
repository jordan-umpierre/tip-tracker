import * as Crypto from 'expo-crypto';
import { getDb } from './db';

// Shape of a row read back from the jobs table. Column names stay snake_case
// to match schema.sql exactly -- there's no mapping layer to camelCase yet,
// and adding one before anything needs it would be guessing at a convention
// nobody's asked for.
export type Job = {
  id: string;
  name: string;
  hourly_rate_cents: number;
  created_at: string;
  updated_at: string;
};

export async function createJob(name: string, hourlyRateCents: number): Promise<string> {
  const db = await getDb();

  // UUIDs are generated on the device rather than left to the database to
  // assign, per schema.sql's own comment: two phones both writing "row 5"
  // would collide once sync exists. expo-crypto is the first-party module
  // for this (see D2 -- prefer maintained Expo modules over random npm ones).
  const id = Crypto.randomUUID();

  // Both created_at and updated_at get the same value on insert. They only
  // diverge once a row is edited later.
  const now = new Date().toISOString();

  // "?" placeholders, with the values passed separately below, instead of
  // building the SQL string by hand with the actual name/rate spliced in.
  // That's not just style -- string-splicing user input into SQL is how SQL
  // injection happens. runAsync() binds the values safely instead.
  //
  // archived_at is explicitly NULL here: a brand new job is never archived.
  await db.runAsync(
    `INSERT INTO jobs (id, name, hourly_rate_cents, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?);`,
    id,
    name,
    hourlyRateCents,
    now,
    now
  );

  // Handing the id back lets the caller immediately use the new job (e.g. to
  // pre-select it on a log-a-shift screen) without a second query.
  return id;
}

export async function listActiveJobs(): Promise<Job[]> {
  const db = await getDb();

  // Reading rows back uses getAllAsync, not runAsync -- runAsync is for
  // writes (insert/update/delete) and returns a result summary, not rows.
  //
  // archived_at IS NULL is the D3 filter: an archived job means "I don't
  // work there anymore" and shouldn't show up in a picker. Every query that
  // lists jobs has to carry this filter -- schema.sql's own comment flags
  // it as the easy-to-forget part.
  return db.getAllAsync<Job>(
    `SELECT id, name, hourly_rate_cents, created_at, updated_at
     FROM jobs
     WHERE archived_at IS NULL
     ORDER BY name;`
  );
}