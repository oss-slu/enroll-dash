import { jest } from '@jest/globals';
import type { QueryResult, QueryResultRow } from 'pg';

type poolQueryFn = (
    text: string,
    params?: unknown[],
) => Promise<QueryResult<QueryResultRow>>;

const poolQuery = jest.fn<poolQueryFn>();
const poolEnd = jest.fn<() => Promise<void>>();
const poolOn =
    jest.fn<(event: string, handler: (err: Error) => void) => void>();

const poolInstance = { query: poolQuery, end: poolEnd, on: poolOn };

const PoolCtor = jest.fn<(config?: unknown) => typeof poolInstance>(
    () => poolInstance,
);

jest.unstable_mockModule('pg', () => ({
    default: { Pool: PoolCtor },
}));

const { pool, query, connectDB, closeDB } = await import('../../db/connect');

// the pool is built and its error listener registered when the module loads,
// so capture that here - clearMocks wipes the call history before each test
const poolConstructions = PoolCtor.mock.calls.length;
const poolConfig = PoolCtor.mock.calls[0][0] as Record<string, unknown>;
const [errorEvent, errorHandler] = poolOn.mock.calls[0];

function queryResult<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
    return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        oid: 0,
        fields: [],
    };
}

describe('db/connect', () => {
    describe('pool setup', () => {
        it('creates one pool shared by the whole api', () => {
            expect(poolConstructions).toBe(1);
            expect(pool).toBe(poolInstance);
        });

        it('bounds the pool size and every timeout', () => {
            expect(poolConfig).toEqual({
                max: 10,
                idleTimeoutMillis: 30_000,
                connectionTimeoutMillis: 5_000,
                statement_timeout: 15_000,
            });
        });

        it('takes connection settings from the environment instead of hardcoding them', () => {
            expect(poolConfig).not.toHaveProperty('host');
            expect(poolConfig).not.toHaveProperty('port');
            expect(poolConfig).not.toHaveProperty('user');
            expect(poolConfig).not.toHaveProperty('password');
            expect(poolConfig).not.toHaveProperty('database');
            expect(poolConfig).not.toHaveProperty('connectionString');
        });
    });

    describe('pool error handling', () => {
        it('listens for errors on idle clients', () => {
            expect(errorEvent).toBe('error');
            expect(typeof errorHandler).toBe('function');
        });

        it('logs an idle client error rather than letting it crash the process', () => {
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            const err = new Error('Connection terminated unexpectedly');

            expect(() => errorHandler(err)).not.toThrow();
            expect(consoleError).toHaveBeenCalledWith(
                'Unexpected PG pool error',
                err,
            );

            consoleError.mockRestore();
        });
    });

    describe('query', () => {
        it('forwards the statement to the pool', async () => {
            poolQuery.mockResolvedValue(queryResult([]));

            await query('select * from acs_tables');

            expect(poolQuery).toHaveBeenCalledWith(
                'select * from acs_tables',
                undefined,
            );
        });

        it('passes values as parameters so they are never interpolated into sql', async () => {
            poolQuery.mockResolvedValue(queryResult([]));

            await query('select * from acs_tables where id = $1', [42]);

            expect(poolQuery).toHaveBeenCalledWith(
                'select * from acs_tables where id = $1',
                [42],
            );
        });

        it('returns the pool result unchanged', async () => {
            const result = queryResult([{ id: 1 }]);
            poolQuery.mockResolvedValue(result);

            await expect(query('select id from acs_tables')).resolves.toBe(
                result,
            );
        });

        it('reuses the one pool across calls', async () => {
            poolQuery.mockResolvedValue(queryResult([]));

            await query('select 1');
            await query('select 2');

            expect(PoolCtor).not.toHaveBeenCalled();
            expect(poolQuery).toHaveBeenCalledTimes(2);
        });

        it('propagates a failed query to the caller', async () => {
            poolQuery.mockRejectedValue(
                new Error('relation "missing" does not exist'),
            );

            await expect(query('select * from missing')).rejects.toThrow(
                'relation "missing" does not exist',
            );
        });

        it('propagates a statement cancelled by the server timeout', async () => {
            poolQuery.mockRejectedValue(
                new Error('canceling statement due to statement timeout'),
            );

            await expect(query('select * from acs_data')).rejects.toThrow(
                'statement timeout',
            );
        });
    });

    describe('connectDB', () => {
        it('checks the connection with a trivial statement', async () => {
            poolQuery.mockResolvedValue(queryResult([{ '?column?': 1 }]));

            await expect(connectDB()).resolves.toBeUndefined();
            expect(poolQuery).toHaveBeenCalledWith('select 1');
        });

        it('rejects when the database refuses the connection', async () => {
            poolQuery.mockRejectedValue(
                new Error('connect ECONNREFUSED 127.0.0.1:5432'),
            );

            await expect(connectDB()).rejects.toThrow('ECONNREFUSED');
        });

        it('rejects when no connection is available before the timeout', async () => {
            poolQuery.mockRejectedValue(
                new Error('timeout exceeded when trying to connect'),
            );

            await expect(connectDB()).rejects.toThrow('timeout exceeded');
        });
    });

    describe('closeDB', () => {
        it('drains the pool', async () => {
            poolEnd.mockResolvedValue(undefined);

            await expect(closeDB()).resolves.toBeUndefined();
            expect(poolEnd).toHaveBeenCalledTimes(1);
        });

        it('propagates a failure during shutdown', async () => {
            poolEnd.mockRejectedValue(
                new Error('Called end on pool more than once'),
            );

            await expect(closeDB()).rejects.toThrow('more than once');
        });
    });
});
