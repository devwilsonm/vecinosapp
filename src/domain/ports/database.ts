export interface StatementResult {
  changes: number;
  lastInsertRowid: number;
}

export interface DatabaseStatement {
  get(...params: unknown[]): Promise<Record<string, any> | undefined>;
  all(...params: unknown[]): Promise<Record<string, any>[]>;
  run(...params: unknown[]): Promise<StatementResult>;
}

export interface DatabasePort {
  prepare(sql: string): DatabaseStatement;
  transaction<T>(work: () => Promise<T>): () => Promise<T>;
}