import { jest } from '@jest/globals';
import request from 'supertest';

type MetadataRow = {
    table_id: string;
    table_title: string;
    column_id: string;
    column_title: string;
};

const query = jest.fn<
    (text: string, params?: unknown[]) => Promise<{ rows: MetadataRow[] }>
>();

jest.unstable_mockModule('../../db/connect', () => ({ query }));

const { createApp } = await import('../../app');
const app = createApp();

describe('GET /acs-metadata', () => {
    beforeEach(() => query.mockReset());

    it('requires at least 1 table ID', async () => {
        const res = await request(app).get('/acs-metadata');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            ok: false,
            message: 'No usable table IDs provided.',
        });

        expect(query).not.toHaveBeenCalled();
    });

    it('returns metadata for the requested tables', async () => {
        const rows: MetadataRow[] = [
            {
                table_id: 'b01001',
                table_title: 'Sex by Age',
                column_id: 'b01001_001',
                column_title: 'Total',
            },
        ];
        query.mockResolvedValue({ rows });

        const res = await request(app).get(
            '/acs-metadata?tables=b01001&tables=b02001',
        );

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, data: rows });
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining(
                'where lower(a.table_id) = any($1::text[])',
            ),
            [['b01001', 'b02001']],
        );
    });

    it('returns 500 if the metadata query fails', async () => {
        query.mockRejectedValue(new Error('Connection failed'));
        const res = await request(app).get('/acs-metadata?tables=b01001');

        expect(res.status).toBe(500);
        expect(res.body.ok).toBe(false);
        expect(res.body.message).toContain('ACS metadata query failed');
    })
})