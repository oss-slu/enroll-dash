import pg from 'pg';
import type { QueryResultRow, QueryResult } from 'pg';

// ** pg reads the PG variables from process.env automatically

export const pool = new pg.Pool({
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
});

// handle unexpected error
pool.on('error', (err) => console.error('Unexpected PG pool error', err));

export function query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
): Promise<QueryResult<R>> {
    return pool.query<R>(text, params);
}

export async function connectDB(): Promise<void> {
    await pool.query('select 1');
}

export function closeDB(): Promise<void> {
    return pool.end();
}
