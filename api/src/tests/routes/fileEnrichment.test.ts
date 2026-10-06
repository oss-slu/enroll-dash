import { jest } from '@jest/globals';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import type { censusGeocodeResp } from '../../types/census';
import type { requestOptions } from '../../types/http';
import {
    readDataset,
    serializeDataset,
    type Dataset,
} from '../../utils/dataset';
import { FILE_LIMITS } from '../../utils/fileLimits';

const getJson =
    jest.fn<
        (url: string, options?: requestOptions) => Promise<censusGeocodeResp>
    >();
jest.unstable_mockModule('../../utils/http', () => ({ getJson }));
const { createApp } = await import('../../app');
const { enrichFile } = await import('../../utils/enrichFile');
const app = createApp();
const addr = '123 Main St, Saint Louis, MO 63103';
const noMatch = '456 Other St, Saint Louis, MO 63103';
const response: censusGeocodeResp = {
    result: {
        input: { address: { address: addr } },
        addressMatches: [
            {
                matchedAddress: 'STANDARDIZED',
                coordinates: { x: -90, y: 38 },
                geographies: {
                    'Census Block Groups': [
                        {
                            GEOID: '001234567890',
                            STATE: '01',
                            COUNTY: '003',
                            TRACT: '000100',
                            BLKGRP: '1',
                            BASENAME: '1',
                        },
                    ],
                },
            },
        ],
    },
};
const table: Dataset = {
    columns: [
        { id: 'a', label: 'identifier' },
        { id: 'b', label: 'address' },
    ],
    rows: [
        ['001', addr],
        ['002', noMatch],
        ['003', addr],
        ['004', 'invalid'],
        ['005', null],
    ],
};
let root: string;
const previousRoot = process.env.UPLOAD_TEMP_DIR;
beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'enrichment-route-'));
    process.env.UPLOAD_TEMP_DIR = root;
    getJson.mockReset();
    getJson.mockImplementation(async (url) =>
        new URL(url).searchParams.get('address') === addr
            ? response
            : {
                  result: {
                      input: { address: { address: noMatch } },
                      addressMatches: [],
                  },
              },
    );
});
afterEach(async () => {
    jest.useRealTimers();
    if (previousRoot === undefined) delete process.env.UPLOAD_TEMP_DIR;
    else process.env.UPLOAD_TEMP_DIR = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
});
async function upload(
    type: 'csv' | 'xls' | 'xlsx' = 'csv',
    buffer = serializeDataset(table, type),
) {
    const res = await request(app)
        .post('/upload')
        .attach('file', buffer, `input.${type}`);
    expect(res.status).toBe(200);
    return res.body;
}
const geocode = (
    input: { tempPath: string; sessionId: string },
    options: Record<string, unknown> = {},
) =>
    request(app)
        .post('/geocode-file')
        .query({ path: input.tempPath })
        .send({ sessionId: input.sessionId, ...options });

it.each(['csv', 'xls', 'xlsx'] as const)(
    'uploads, enriches and reopens real %s outputs with default fields',
    async (type) => {
        const input = await upload(type);
        const original = await fs.readFile(input.tempPath);
        const res = await geocode(input);
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.counts).toEqual({
            input: 5,
            output: 5,
            matched: 2,
            unmatched: 1,
            invalidOrBlank: 2,
        });
        expect(res.body.addressField).toBe('field2');
        expect(res.body.geocodeMapping).toHaveLength(8);
        expect(getJson).toHaveBeenCalledTimes(2);
        const output = readDataset(await fs.readFile(res.body.tempPath), type);
        expect(output.rows.map((row) => row[0])).toEqual([
            '001',
            '002',
            '003',
            '004',
            '005',
        ]);
        expect(output.rows[0].slice(2)).toEqual([
            'STANDARDIZED',
            ...(type === 'csv' ? ['38', '-90'] : [38, -90]),
            '001234567890',
            '01',
            '003',
            '000100',
            '1',
        ]);
        expect(output.rows[3].slice(2)).toEqual(
            Array(8).fill(type === 'csv' ? '' : null),
        );
        expect(
            res.body.columnMapping.map((col: { output: string }) => col.output),
        ).toEqual(output.columns.map((col) => col.label));
        expect((await fs.readFile(input.tempPath)).equals(original)).toBe(true);
        await request(app).delete(`/upload/${input.sessionId}`).expect(200);
        await expect(fs.stat(res.body.tempPath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    },
);

it('selects fields and inner join without multiplying duplicate rows', async () => {
    const input = await upload();
    const res = await geocode(input, {
        addressField: 'address',
        join: 'inner',
        fields: ['state'],
    });
    expect(res.status).toBe(201);
    expect(
        readDataset(await fs.readFile(res.body.tempPath), 'csv').rows,
    ).toEqual([
        ['001', addr, '01'],
        ['003', addr, '01'],
    ]);
});

it('detects past a blank first value and returns actionable candidate IDs for zero/multiple columns', async () => {
    const blankFirst = await upload(
        'csv',
        Buffer.from(`address\n\n"${addr}"\n`),
    );
    expect((await geocode(blankFirst)).status).toBe(201);
    const ambiguous = await upload(
        'csv',
        Buffer.from(`home,mailing\n"${addr}","${noMatch}"`),
    );
    getJson.mockClear();
    const res = await geocode(ambiguous);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
        code: 'AMBIGUOUS_ADDRESS_FIELDS',
        candidates: ['field1', 'field2'],
    });
    expect(getJson).not.toHaveBeenCalled();
    expect((await geocode(ambiguous, { addressField: 'field2' })).status).toBe(
        201,
    );
    const absent = await upload('csv', Buffer.from('name\nZoë'));
    const noCandidate = await geocode(absent);
    expect(noCandidate.status).toBe(422);
    expect(noCandidate.body.candidates).toEqual([]);
});

it('supports headerless records, selected worksheet, duplicate headers and collision mappings', async () => {
    const input = await upload(
        'csv',
        Buffer.from(`001,"${addr}"\n002,"${addr}"`),
    );
    const res = await geocode(input, { hasHeaders: false, fields: ['state'] });
    expect(res.status).toBe(201);
    expect(
        readDataset(await fs.readFile(res.body.tempPath), 'csv').rows,
    ).toEqual([
        ['001', addr, '01'],
        ['002', addr, '01'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([['wrong'], ['bad']]),
        'First',
    );
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
            ['address', 'address', '', 'geocode_state'],
            ['invalid', addr, '001', 'keep'],
        ]),
        'Applicants',
    );
    const excel = await upload(
        'xlsx',
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    );
    const chosen = await geocode(excel, {
        sheet: 'Applicants',
        addressField: 'field2',
        fields: ['state'],
    });
    expect(chosen.status).toBe(201);
    expect(
        readDataset(
            await fs.readFile(chosen.body.tempPath),
            'xlsx',
        ).columns.map((col) => col.label),
    ).toEqual([
        'address',
        'address_2',
        'field3',
        'geocode_state',
        'geocode_state_2',
    ]);
});

it.each([
    { fields: [] },
    { fields: ['unknown'] },
    { fields: ['state', 'state'] },
    { fields: 'state' },
    { fields: null },
    { join: 'outer' },
    { join: null },
    { hasHeaders: 'false' },
    { sheet: 42 },
    { addressField: 5 },
    { sessionId: '../bad' },
])('rejects malformed options before Census: %j', async (options) => {
    const input = await upload();
    const res = await geocode(input, options);
    expect(res.status).toBe(400);
    expect(getJson).not.toHaveBeenCalled();
    expect(await fs.readdir(path.dirname(input.tempPath))).toHaveLength(1);
});

it('rejects invalid columns, unknown sheets, empty/malformed files and excessive workloads', async () => {
    const input = await upload();
    expect((await geocode(input, { addressField: 'missing' })).status).toBe(
        422,
    );
    expect((await geocode(input, { sheet: 'not a CSV option' })).status).toBe(
        400,
    );
    const excel = await upload('xlsx');
    expect((await geocode(excel, { sheet: 'missing' })).status).toBe(422);
    for (const text of ['', 'a\n"broken'])
        expect(
            (await geocode(await upload('csv', Buffer.from(text)))).status,
        ).toBe(422);
    const big = await upload('csv', Buffer.alloc(FILE_LIMITS.bytes + 1, 'a'));
    expect((await geocode(big)).status).toBe(413);
    const tooMany = await upload(
        'csv',
        Buffer.from(
            'address\n' +
                Array.from(
                    { length: FILE_LIMITS.uniqueGeocodes + 1 },
                    (_, i) => `${i + 1} Main St`,
                ).join('\n'),
        ),
    );
    expect((await geocode(tooMany)).status).toBe(413);
    expect(getJson).not.toHaveBeenCalled();
});

it('fails without output for Census outage and per-call timeout', async () => {
    const input = await upload();
    getJson.mockRejectedValue(new Error('Census outage with private address'));
    const failed = await geocode(input);
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain('private address');
    getJson.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    expect((await geocode(input)).status).toBe(504);
    expect(await fs.readdir(path.dirname(input.tempPath))).toHaveLength(1);
});

it('expires a whole operation, aborts upstream signals and publishes no output', async () => {
    const input = await upload();
    // Use the real orchestration with a synthetic slow Census boundary and fake time.
    const controller = new AbortController();
    jest.useFakeTimers();
    let started: () => void;
    const ready = new Promise<void>((resolve) => {
        started = resolve;
    });
    const upstreamSignals: AbortSignal[] = [];
    const pending = enrichFile(
        input.tempPath,
        { sessionId: input.sessionId },
        controller.signal,
        (_address, signal) => {
            expect(signal.aborted).toBe(false);
            upstreamSignals.push(signal);
            started();
            return new Promise(() => {});
        },
    );
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
    await ready;
    await jest.advanceTimersByTimeAsync(FILE_LIMITS.durationMs + 1);
    await assertion;
    expect(upstreamSignals.length).toBeGreaterThan(0);
    expect(upstreamSignals.every((signal) => signal.aborted)).toBe(true);
    jest.useRealTimers();
    expect(await fs.readdir(path.dirname(input.tempPath))).toHaveLength(1);
});

it('rejects foreign and cross-session paths and missing files', async () => {
    const input = await upload();
    const other = await upload();
    expect((await geocode({ ...input, tempPath: other.tempPath })).status).toBe(
        400,
    );
    expect(
        (await geocode({ ...input, tempPath: path.join(root, 'foreign.csv') }))
            .status,
    ).toBe(400);
    expect(
        (
            await geocode({
                ...input,
                tempPath: path.join(
                    path.dirname(input.tempPath),
                    'missing.csv',
                ),
            })
        ).status,
    ).toBe(404);
    expect(getJson).not.toHaveBeenCalled();
});

it.each(['csv', 'xls', 'xlsx'] as const)(
    'saves datasets through the shared %s writer with unique outputs',
    async (format) => {
        const sessionId = randomUUID();
        const res = await request(app)
            .post('/dataset-file')
            .send({
                sessionId,
                filename: `saved.${format}`,
                format,
                dataset: table,
            });
        expect(res.status).toBe(201);
        expect(
            readDataset(await fs.readFile(res.body.tempPath), format)
                .rows[0][0],
        ).toBe('001');
        const second = await request(app)
            .post('/dataset-file')
            .send({
                sessionId,
                filename: `saved.${format}`,
                format,
                dataset: table,
            });
        expect(second.status).toBe(201);
        expect(second.body.filename).not.toBe(res.body.filename);
    },
);

it('preserves long original XLS text through dataset save and geocode routes', async () => {
    const longHeader = `original_note_${'🧪'.repeat(125)}`;
    const longValue = `Scholarship details: ${'漢'.repeat(300)}`;
    const dataset: Dataset = {
        columns: [
            { id: 'address', label: 'address' },
            { id: 'note', label: longHeader },
        ],
        rows: [[addr, longValue]],
    };

    const saved = await request(app).post('/dataset-file').send({
        sessionId: randomUUID(),
        filename: 'long-values.xls',
        format: 'xls',
        dataset,
    });
    expect(saved.status).toBe(201);
    const savedDataset = readDataset(
        await fs.readFile(saved.body.tempPath),
        'xls',
    );
    expect(savedDataset.columns.map((col) => col.label)).toEqual([
        'address',
        longHeader,
    ]);
    expect(savedDataset.rows).toEqual([[addr, longValue]]);
    expect(
        saved.body.columnMapping.map((col: { output: string }) => col.output),
    ).toEqual(savedDataset.columns.map((col) => col.label));

    const rejectedSession = randomUUID();
    const tooLong = await request(app)
        .post('/dataset-file')
        .send({
            sessionId: rejectedSession,
            filename: 'too-long.xls',
            format: 'xls',
            dataset: {
                columns: [{ id: 'note', label: 'note' }],
                rows: [['x'.repeat(4111)]],
            },
        });
    expect(tooLong.status).toBe(413);
    expect(tooLong.body.code).toBe('XLS_TEXT_TOO_LARGE');
    await expect(
        fs.readdir(path.join(root, rejectedSession)),
    ).rejects.toMatchObject({
        code: 'ENOENT',
    });

    // This input fixture uses SheetJS shared strings and is checked before upload,
    // so the enrichment assertion does not inherit text truncated by XLS writing.
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
            ['address', longHeader],
            [addr, longValue],
        ]),
        'Dataset',
    );
    const fixture = Buffer.from(
        XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xls',
            bookSST: true,
        }),
    );
    const completeFixture = readDataset(fixture, 'xls');
    expect(completeFixture.columns.map((col) => col.label)).toEqual([
        'address',
        longHeader,
    ]);
    expect(completeFixture.rows).toEqual([[addr, longValue]]);

    const input = await upload('xls', fixture);
    const enriched = await geocode(input, { fields: ['state'] });
    expect(enriched.status).toBe(201);
    const enrichedDataset = readDataset(
        await fs.readFile(enriched.body.tempPath),
        'xls',
    );
    expect(enrichedDataset.columns.slice(0, 2).map((col) => col.label)).toEqual(
        ['address', longHeader],
    );
    expect(enrichedDataset.rows[0].slice(0, 2)).toEqual([addr, longValue]);
    expect(
        enriched.body.columnMapping.map(
            (col: { output: string }) => col.output,
        ),
    ).toEqual(enrichedDataset.columns.map((col) => col.label));
});

it('rejects malformed save requests, extension mismatch and oversized JSON', async () => {
    const sessionId = randomUUID();
    for (const options of [
        { filename: '../bad.csv', format: 'csv', dataset: table },
        { filename: 'a.xlsx', format: 'csv', dataset: table },
        {
            filename: 'a.csv',
            format: 'csv',
            dataset: { columns: table.columns, rows: [[1]] },
        },
    ]) {
        const res = await request(app)
            .post('/dataset-file')
            .send({ sessionId, ...options });
        expect(res.status).toBe(400);
    }
    const oversized = await request(app)
        .post('/dataset-file')
        .send({ sessionId, data: 'a'.repeat(FILE_LIMITS.bytes + 1) });
    expect(oversized.status).toBe(413);
    expect(oversized.body.success).toBe(false);
    const malformed = await request(app)
        .post('/geocode-file')
        .set('Content-Type', 'application/json')
        .send('{');
    expect(malformed.status).toBe(400);
});

it('cancels active file enrichment without publishing and releases the session', async () => {
    const input = await upload();
    const controller = new AbortController();
    await expect(
        enrichFile(
            input.tempPath,
            { sessionId: input.sessionId },
            controller.signal,
            async (_addr, signal) => {
                controller.abort();
                expect(signal.aborted).toBe(true);
                return null;
            },
        ),
    ).rejects.toMatchObject({ status: 504 });
    expect(await fs.readdir(path.dirname(input.tempPath))).toHaveLength(1);
    await request(app).delete(`/upload/${input.sessionId}`).expect(200);
});

it('uses IDs before labels and accepts explicit selection of header-only datasets', async () => {
    const input = await upload(
        'csv',
        Buffer.from(`field2,address\nname,"${addr}"`),
    );
    const selected = await geocode(input, { addressField: 'field2' });
    expect(selected.status).toBe(201);
    expect(selected.body.counts.matched).toBe(1);
    expect(
        readDataset(await fs.readFile(selected.body.tempPath), 'csv').rows[0],
    ).toEqual([
        'name',
        addr,
        'STANDARDIZED',
        '38',
        '-90',
        '001234567890',
        '01',
        '003',
        '000100',
        '1',
    ]);
    const empty = await upload('csv', Buffer.from('identifier,address\n'));
    const res = await geocode(empty, { addressField: 'address' });
    expect(res.status).toBe(201);
    expect(res.body.counts).toEqual({
        input: 0,
        output: 0,
        matched: 0,
        unmatched: 0,
        invalidOrBlank: 0,
    });
    expect(
        readDataset(await fs.readFile(res.body.tempPath), 'csv').rows,
    ).toEqual([]);
});

it('treats a Census match without block-group data as unmatched', async () => {
    const input = await upload();
    getJson.mockResolvedValue({
        result: {
            ...response.result,
            addressMatches: [
                { ...response.result.addressMatches[0], geographies: {} },
            ],
        },
    });
    const res = await geocode(input, { join: 'inner' });
    expect(res.status).toBe(201);
    expect(res.body.counts).toMatchObject({
        output: 0,
        matched: 0,
        unmatched: 3,
    });
});
