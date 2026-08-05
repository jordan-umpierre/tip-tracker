export type SyncEntityType = "job" | "shift" | "federal_withholding_setting";

export type JobRecord = {
  archivedAt: string | null;
  createdAt: string;
  hourlyRateCents: number;
  name: string;
  overtimeEnabled: boolean;
  updatedAt: string;
  workweekStartTime: string;
  workweekStartWeekday: number;
};

export type ShiftRecord = {
  createdAt: string;
  deletedAt: string | null;
  durationSeconds: number;
  endTime: string | null;
  hourlyRateCents: number;
  jobId: string;
  note: string | null;
  shiftDate: string;
  startTime: string | null;
  tipsCents: number;
  updatedAt: string;
};

export type FederalWithholdingSettingRecord = {
  createdAt: string;
  deletedAt: string | null;
  effectiveFrom: string;
  exempt: boolean;
  filingStatus:
    | "single-or-married-filing-separately"
    | "married-filing-jointly"
    | "head-of-household";
  jobId: string;
  payPeriodsPerYear: number;
  step2Checked: boolean;
  step3CreditsCents: number;
  step4aOtherIncomeCents: number;
  step4bDeductionsCents: number;
  step4cExtraWithholdingCents: number;
  updatedAt: string;
};

export type SyncRecord = JobRecord | ShiftRecord | FederalWithholdingSettingRecord;

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

const MUTATION_KEYS = [
  "baseServerVersion", "deviceId", "entityId", "entityType", "operation", "operationId", "record",
] as const;
const JOB_KEYS = [
  "archivedAt", "createdAt", "hourlyRateCents", "name", "overtimeEnabled", "updatedAt",
  "workweekStartTime", "workweekStartWeekday",
] as const;
const SHIFT_KEYS = [
  "createdAt", "deletedAt", "durationSeconds", "endTime", "hourlyRateCents", "jobId",
  "note", "shiftDate", "startTime", "tipsCents", "updatedAt",
] as const;
const FEDERAL_SETTING_KEYS = [
  "createdAt", "deletedAt", "effectiveFrom", "exempt", "filingStatus", "jobId",
  "payPeriodsPerYear", "step2Checked", "step3CreditsCents", "step4aOtherIncomeCents",
  "step4bDeductionsCents", "step4cExtraWithholdingCents", "updatedAt",
] as const;
const FILING_STATUSES = new Set([
  "single-or-married-filing-separately",
  "married-filing-jointly",
  "head-of-household",
]);
const PAY_PERIODS = new Set([2, 4, 12, 24, 26, 52, 260]);

export function parseSyncMutation(value: unknown): SyncMutation {
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
    record: operation === "delete" ? readDeleteRecord(input.record, entityType) : readRecord(entityType, input.record),
  };
  if (operation === "delete" && mutation.baseServerVersion === null) invalid();
  return mutation;
}

function readRecord(entityType: SyncEntityType, value: unknown): SyncRecord {
  if (entityType === "job") return readJob(value);
  if (entityType === "shift") return readShift(value);
  return readFederalSetting(value);
}

function readJob(value: unknown): JobRecord {
  const input = readObject(value);
  assertExactKeys(input, JOB_KEYS);
  return {
    archivedAt: readNullableTimestamp(input.archivedAt),
    createdAt: readTimestamp(input.createdAt),
    hourlyRateCents: readNonnegativeInteger(input.hourlyRateCents),
    name: readText(input.name),
    overtimeEnabled: readBoolean(input.overtimeEnabled),
    updatedAt: readTimestamp(input.updatedAt),
    workweekStartTime: readTime(input.workweekStartTime),
    workweekStartWeekday: readIntegerInRange(input.workweekStartWeekday, 0, 6),
  };
}

function readShift(value: unknown): ShiftRecord {
  const input = readObject(value);
  assertExactKeys(input, SHIFT_KEYS);
  const startTime = readNullableTime(input.startTime);
  const endTime = readNullableTime(input.endTime);
  if ((startTime === null) !== (endTime === null)) invalid();
  const durationSeconds = readPositiveInteger(input.durationSeconds);
  const hourlyRateCents = readNonnegativeInteger(input.hourlyRateCents);
  if (!Number.isSafeInteger(durationSeconds * hourlyRateCents)) invalid();
  return {
    createdAt: readTimestamp(input.createdAt),
    deletedAt: readNullableTimestamp(input.deletedAt),
    durationSeconds,
    endTime,
    hourlyRateCents,
    jobId: readNonemptyText(input.jobId),
    note: readNullableText(input.note),
    shiftDate: readDate(input.shiftDate),
    startTime,
    tipsCents: readNonnegativeInteger(input.tipsCents),
    updatedAt: readTimestamp(input.updatedAt),
  };
}

function readFederalSetting(value: unknown): FederalWithholdingSettingRecord {
  const input = readObject(value);
  assertExactKeys(input, FEDERAL_SETTING_KEYS);
  const filingStatus = readText(input.filingStatus);
  const payPeriodsPerYear = readNonnegativeInteger(input.payPeriodsPerYear);
  if (!FILING_STATUSES.has(filingStatus) || !PAY_PERIODS.has(payPeriodsPerYear)) invalid();
  return {
    createdAt: readTimestamp(input.createdAt),
    deletedAt: readNullableTimestamp(input.deletedAt),
    effectiveFrom: readDate(input.effectiveFrom),
    exempt: readBoolean(input.exempt),
    filingStatus: filingStatus as FederalWithholdingSettingRecord["filingStatus"],
    jobId: readNonemptyText(input.jobId),
    payPeriodsPerYear,
    step2Checked: readBoolean(input.step2Checked),
    step3CreditsCents: readNonnegativeInteger(input.step3CreditsCents),
    step4aOtherIncomeCents: readNonnegativeInteger(input.step4aOtherIncomeCents),
    step4bDeductionsCents: readNonnegativeInteger(input.step4bDeductionsCents),
    step4cExtraWithholdingCents: readNonnegativeInteger(input.step4cExtraWithholdingCents),
    updatedAt: readTimestamp(input.updatedAt),
  };
}

function readDeleteRecord(value: unknown, entityType: SyncEntityType) {
  if (value !== null || entityType === "job") invalid();
  return null;
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid();
}

function readEntityType(value: unknown): SyncEntityType {
  if (value !== "job" && value !== "shift" && value !== "federal_withholding_setting") invalid();
  return value;
}

function readOperation(value: unknown): "upsert" | "delete" {
  if (value !== "upsert" && value !== "delete") invalid();
  return value;
}

function readText(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}

function readNonemptyText(value: unknown) {
  const text = readText(value);
  if (text.length === 0) invalid();
  return text;
}

function readCanonicalUuid(value: unknown) {
  const text = readText(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    invalid();
  }
  return text;
}

function readNullableText(value: unknown) {
  return value === null ? null : readText(value);
}

function readBoolean(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function readPositiveInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) invalid();
  return Number(value);
}

function readNonnegativeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalid();
  return Number(value);
}

function readNullablePositiveInteger(value: unknown) {
  return value === null ? null : readPositiveInteger(value);
}

function readIntegerInRange(value: unknown, minimum: number, maximum: number) {
  const integer = readNonnegativeInteger(value);
  if (integer < minimum || integer > maximum) invalid();
  return integer;
}

function readTimestamp(value: unknown) {
  const text = readText(value);
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) invalid();
  return text;
}

function readNullableTimestamp(value: unknown) {
  return value === null ? null : readTimestamp(value);
}

function readTime(value: unknown) {
  const text = readText(value);
  if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(text)) invalid();
  return text;
}

function readNullableTime(value: unknown) {
  return value === null ? null : readTime(value);
}

function readDate(value: unknown) {
  const text = readText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) invalid();
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) invalid();
  return text;
}

function invalid(): never {
  throw new InvalidSyncRequestError("Invalid sync mutation");
}
