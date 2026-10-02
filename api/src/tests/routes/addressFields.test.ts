import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp } from '../../app';

describe('GET /address-fields', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'address-route-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns potential address fields from a CSV file', async () => {
        const filePath = path.join(tempDir, 'addresses.csv');

        fs.writeFileSync(
            filePath,
            [
                'name,address,city',
                'Darcy,"6957 Chippewa St, Saint Louis, MO 63109",St. Louis',
            ].join('\n'),
        );

        const app = createApp();
        const res = await request(app)
            .get('/address-fields')
            .query({ path: filePath });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(['address']);
    });

    it('returns potential address fields from an Excel file', async () => {
        const filePath = path.join(tempDir, 'addresses.xlsx');

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([
            ['name', 'address'],
            ['Darcy', '1 N. Grand Blvd, Saint Louis, MO 63103'],
        ]);

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        XLSX.writeFile(workbook, filePath);

        const app = createApp();
        const res = await request(app)
            .get('/address-fields')
            .query({ path: filePath });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(['address']);
    });

    it('returns 400 when the path is missing', async () => {
        const app = createApp();
        const res = await request(app).get('/address-fields');

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
    });
});