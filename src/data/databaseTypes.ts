export type SqlValue = string | number | null | Uint8Array;

export type DatabaseTransaction = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
};

export type TransactionalDatabase = DatabaseTransaction & {
  withExclusiveTransactionAsync(
    task: (transaction: DatabaseTransaction) => Promise<void>
  ): Promise<void>;
};
