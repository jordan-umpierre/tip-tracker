import {
  bindSyncAccount,
  bindSyncAccountIfEmpty,
  inspectLocalAccountState,
  SyncAccountMismatchError,
  type SyncDatabase,
} from '../data/sync.ts';
import type { VerifiedAccount } from './accountApi.ts';

export type AccountConnection =
  | { account: VerifiedAccount; state: 'connected' }
  | { account: VerifiedAccount; localRecordCount: number; state: 'consent_required' };

type VerifyAccount = () => Promise<VerifiedAccount>;

// Both entry points below have to do the same two things before they are
// allowed to touch the local binding: confirm the identity with the backend,
// and refuse a database that already belongs to somebody else. That refusal is
// the check standing between two accounts and each other's shift data, so it
// lives in one function -- duplicated, it could be relaxed on one path and not
// the other, and only the neglected path would be exploitable.
async function verifyAgainstLocalAccount(
  database: SyncDatabase,
  verifyAccount: VerifyAccount
) {
  const account = await verifyAccount();
  const local = await inspectLocalAccountState(database);
  if (local.accountId !== null && local.accountId !== account.id) {
    throw new SyncAccountMismatchError(
      'This local database belongs to a different cloud account.'
    );
  }
  return { account, local };
}

export async function prepareAccountConnection(
  database: SyncDatabase,
  verifyAccount: VerifyAccount
): Promise<AccountConnection> {
  // The backend identity is checked before any durable account binding.
  const { account, local } = await verifyAgainstLocalAccount(database, verifyAccount);

  if (local.accountId === account.id) return { account, state: 'connected' };
  if (local.localRecordCount > 0) {
    return {
      account,
      localRecordCount: local.localRecordCount,
      state: 'consent_required',
    };
  }

  const bound = await bindSyncAccountIfEmpty(database, account.id);
  if (!bound) {
    const current = await inspectLocalAccountState(database);
    return {
      account,
      localRecordCount: current.localRecordCount,
      state: 'consent_required',
    };
  }
  return { account, state: 'connected' };
}

export async function confirmAccountConnection(
  database: SyncDatabase,
  verifyAccount: VerifyAccount
): Promise<AccountConnection> {
  // Consent can remain on screen while a session changes, so identity is
  // verified again immediately before the irreversible local binding.
  const { account } = await verifyAgainstLocalAccount(database, verifyAccount);
  await bindSyncAccount(database, account.id);
  return { account, state: 'connected' };
}
