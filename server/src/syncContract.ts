// Request-direction parsing: what this server accepts from an app.
//
// The record shapes and their validators are not defined here. They live in
// contracts/syncFormat.ts, shared verbatim with the client, because a wire
// format kept in two hand-written copies is a format that eventually disagrees
// with itself. What stays here is the half only a server needs: the mutation
// envelope, the query string, and this side's error types.
import {
  assertExactKeys,
  invalid,
  InvalidSyncRecordError,
  readEntityType,
  readNonemptyText,
  readObject,
  readPositiveInteger,
  readSyncRecord,
  readText,
  type SyncEntityType,
  type SyncRecord,
} from "../../contracts/syncFormat.ts";

export type {
  FederalWithholdingSettingRecord,
  JobRecord,
  ShiftRecord,
  SyncEntityType,
  SyncRecord,
} from "../../contracts/syncFormat.ts";

export type SyncMutation = {
  baseServerVersion: number | null;
  deviceId: string;
  entityId: string;
  entityType: SyncEntityType;
  operation: "upsert" | "delete";
  operationId: number;
  record: SyncRecord | null;
};

export class InvalidSyncRequestError extends Error {}
export class InvalidSyncQueryError extends Error {}

export type ChangesQuery = { after: number; limit: number };

const MUTATION_KEYS = [
  "baseServerVersion", "deviceId", "entityId", "entityType", "operation", "operationId", "record",
] as const;

export function parseSyncMutation(value: unknown): SyncMutation {
  try {
    return readMutation(value);
  } catch (error) {
    // The shared format throws its own error because it cannot know which side
    // is using it. Callers here only ever handle InvalidSyncRequestError, so it
    // is converted at this one boundary rather than everywhere it is caught.
    if (error instanceof InvalidSyncRecordError) {
      throw new InvalidSyncRequestError("Invalid sync mutation");
    }
    throw error;
  }
}

function readMutation(value: unknown): SyncMutation {
  const input = readObject(value);
  assertExactKeys(input, MUTATION_KEYS);
  const entityType = readEntityType(input.entityType);
  const operation = readOperation(input.operation);
  const mutation = {
    baseServerVersion: readNullablePositiveInteger(input.baseServerVersion),
    deviceId: readCanonicalUuid(input.deviceId),
    entityId: readNonemptyText(input.entityId),
    entityType,
    operation,
    operationId: readPositiveInteger(input.operationId),
    record: operation === "delete"
      ? readDeleteRecord(input.record, entityType)
      : readSyncRecord(entityType, input.record),
  };
  // A delete has to say which version it believes it is deleting, otherwise it
  // cannot be checked against the row actually stored.
  if (operation === "delete" && mutation.baseServerVersion === null) invalid();
  return mutation;
}

export function parseChangesQuery(value: unknown): ChangesQuery {
  let input: Record<string, unknown>;
  try {
    input = readObject(value);
  } catch (error) {
    if (error instanceof InvalidSyncRecordError) {
      throw new InvalidSyncQueryError("Sync query must be an object");
    }
    throw error;
  }
  assertAllowedKeys(input, ["after", "limit"]);
  if (!("after" in input)) throw new InvalidSyncQueryError("after is required");
  const after = readQueryInteger(input.after, 0, Number.MAX_SAFE_INTEGER);
  const limit = "limit" in input ? readQueryInteger(input.limit, 1, 200) : 100;
  return { after, limit };
}

function readDeleteRecord(value: unknown, entityType: SyncEntityType) {
  // Jobs are archived rather than deleted, so a job delete is never valid.
  if (value !== null || entityType === "job") invalid();
  return null;
}

function assertAllowedKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new InvalidSyncQueryError("Unknown sync query field");
  }
}

// Query values arrive as strings, so they get their own reader rather than the
// shared numeric ones: "007" and "1e3" are numbers to JavaScript but are not
// canonical, and accepting them would make one cursor position reachable by
// several different URLs.
function readQueryInteger(value: unknown, minimum: number, maximum: number) {
  const text = readQueryIntegerText(value);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new InvalidSyncQueryError("Sync query integer is out of range");
  }
  return number;
}

function readQueryIntegerText(value: unknown) {
  if (typeof value !== "string") {
    throw new InvalidSyncQueryError("Sync query values must be canonical integers");
  }
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new InvalidSyncQueryError("Sync query values must be canonical integers");
  }
  return value;
}

function readOperation(value: unknown): "upsert" | "delete" {
  if (value !== "upsert" && value !== "delete") invalid();
  return value;
}

function readCanonicalUuid(value: unknown) {
  const text = readText(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    invalid();
  }
  return text;
}

function readNullablePositiveInteger(value: unknown) {
  return value === null ? null : readPositiveInteger(value);
}
