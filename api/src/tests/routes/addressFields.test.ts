import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp } from '../../app';

const app = createApp();
let root: string;
const previousRoot = process.env.UPLOAD_TEMP_DIR;
beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'address-route-'));
    process.env.UPLOAD_TEMP_DIR = root;
});
afterEach(async () => {
    if (previousRoot === undefined) delete process.env.UPLOAD_TEMP_DIR;
    else process.env.UPLOAD_TEMP_DIR = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
});

it.each(['csv', 'xlsx'] as const)(
    'returns address labels from uploaded %s files',
    async (type) => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.aoa_to_sheet([
                ['name', 'address'],
                ['Darcy', '1 N. Grand Blvd, Saint Louis, MO 63103'],
            ]),
            'Sheet1',
        );
        const uploaded = await request(app)
            .post('/upload')
            .attach(
                'file',
                XLSX.write(workbook, { type: 'buffer', bookType: type }),
                `addresses.${type}`,
            );
        const res = await request(app).get('/address-fields').query({
            path: uploaded.body.tempPath,
            sessionId: uploaded.body.sessionId,
        });
        expect(res.status).toBe(200);
        expect(res.body).toEqual(['address']);
    },
);

it('requires a session and path and rejects cross-session filesystem access', async () => {
    const uploaded = await request(app)
        .post('/upload')
        .attach('file', Buffer.from('address\n123 Main St'), 'addresses.csv');
    expect(uploaded.status).toBe(200);
    const { tempPath, sessionId } = uploaded.body;
    for (const query of [{ path: tempPath }, { sessionId }]) {
        const res = await request(app).get('/address-fields').query(query);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_OPTIONS');
    }
    const other = await request(app)
        .post('/upload')
        .attach('file', Buffer.from('address\n456 Other St'), 'other.csv');
    expect(other.status).toBe(200);
    const res = await request(app)
        .get('/address-fields')
        .query({ path: other.body.tempPath, sessionId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PATH');
});
