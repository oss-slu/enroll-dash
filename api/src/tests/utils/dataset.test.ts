import * as XLSX from 'xlsx';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
    fileType,
    readDataset,
    saveDataset,
    serializeDataset,
    outputColumns,
    validateDataset,
    type Dataset,
} from '../../utils/dataset';
import { FILE_LIMITS } from '../../utils/fileLimits';

const table: Dataset = {
    columns: [
        { id: 'a', label: 'name' },
        { id: 'b', label: 'identifier' },
        { id: 'c', label: 'value' },
    ],
    rows: [
        ['Zoë, 李\n"quoted"', '00123', null],
        ['André', '00001', 'hello'],
    ],
};

it.each(['csv', 'xls', 'xlsx'] as const)(
    'round trips Unicode, quotes, newlines, zeros and empty cells in %s',
    (type) => {
        const parsed = readDataset(serializeDataset(table, type), type);
        expect(parsed.columns.map((col) => col.label)).toEqual([
            'name',
            'identifier',
            'value',
        ]);
        expect(parsed.rows[0]).toEqual([
            table.rows[0][0],
            '00123',
            type === 'csv' ? '' : null,
        ]);
        expect(parsed.rows[1]).toEqual(table.rows[1]);
    },
);

it.each(['xls', 'xlsx'] as const)(
    'preserves supported Excel cell types in %s',
    (type) => {
        const date = new Date('2026-01-02T00:00:00Z');
        const dataset: Dataset = {
            columns: [{ id: 'a', label: 'value' }],
            rows: [[123.5], [true], [date], ['001']],
        };
        expect(readDataset(serializeDataset(dataset, type), type).rows).toEqual(
            dataset.rows,
        );
    },
);

it('preserves long XLS text and header mappings when saving and reopening', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dataset-xls-'));
    const previousRoot = process.env.UPLOAD_TEMP_DIR;
    process.env.UPLOAD_TEMP_DIR = root;
    try {
        const sharedHeaderPrefix = 'p'.repeat(255);
        const headers = [
            'h'.repeat(255),
            'h'.repeat(256),
            `${sharedHeaderPrefix}A`,
            `${sharedHeaderPrefix}B`,
            'm'.repeat(4110),
        ];
        const values = [
            'v'.repeat(255),
            'v'.repeat(256),
            '🧭'.repeat(130),
            '漢'.repeat(300),
            'v'.repeat(4110),
        ];
        const dataset: Dataset = {
            columns: headers.map((label, i) => ({
                id: `field${i + 1}`,
                label,
            })),
            rows: [values],
        };
        const saved = await saveDataset(
            randomUUID(),
            'long-values.xls',
            dataset,
            'xls',
        );
        const reopened = readDataset(await fs.readFile(saved.tempPath), 'xls');

        expect(reopened.columns.map((col) => col.label)).toEqual(headers);
        expect(reopened.rows).toEqual([values]);
        expect(saved.columnMapping.map((col) => col.source)).toEqual(headers);
        expect(saved.columnMapping.map((col) => col.output)).toEqual(
            reopened.columns.map((col) => col.label),
        );
    } finally {
        if (previousRoot === undefined) delete process.env.UPLOAD_TEMP_DIR;
        else process.env.UPLOAD_TEMP_DIR = previousRoot;
        await fs.rm(root, { recursive: true, force: true });
    }
});

it.each(['header', 'cell'] as const)(
    'rejects XLS %s text beyond the shared-string writer limit before saving',
    async (kind) => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dataset-xls-'));
        const previousRoot = process.env.UPLOAD_TEMP_DIR;
        process.env.UPLOAD_TEMP_DIR = root;
        try {
            const longText = 'x'.repeat(4111);
            const dataset: Dataset = {
                columns: [
                    {
                        id: 'field1',
                        label: kind === 'header' ? longText : 'value',
                    },
                ],
                rows: [[kind === 'cell' ? longText : 'ok']],
            };
            validateDataset(dataset);
            await expect(
                saveDataset(randomUUID(), 'long-values.xls', dataset, 'xls'),
            ).rejects.toMatchObject({
                status: 413,
                code: 'XLS_TEXT_TOO_LARGE',
            });
            expect(await fs.readdir(root)).toEqual([]);
        } finally {
            if (previousRoot === undefined) delete process.env.UPLOAD_TEMP_DIR;
            else process.env.UPLOAD_TEMP_DIR = previousRoot;
            await fs.rm(root, { recursive: true, force: true });
        }
    },
);

it('keeps the first record in headerless input and stable IDs for duplicate/blank headers', () => {
    expect(
        readDataset(Buffer.from('001,"123 Main St"\n002,blank'), 'csv', {
            hasHeaders: false,
        }).rows,
    ).toEqual([
        ['001', '123 Main St'],
        ['002', 'blank'],
    ]);
    const parsed = readDataset(
        Buffer.from('same,,same,field2,same_2\n1,2,3,4,5'),
        'csv',
    );
    expect(parsed.columns.map((col) => col.id)).toEqual([
        'field1',
        'field2',
        'field3',
        'field4',
        'field5',
    ]);
    expect(parsed.columns.map((col) => col.label)).toEqual([
        'same',
        '',
        'same',
        'field2',
        'same_2',
    ]);
    expect(
        outputColumns(parsed.columns).columnMapping.map((col) => col.output),
    ).toEqual(['same', 'field2_2', 'same_3', 'field2', 'same_2']);
});

it('selects a worksheet, rejects unknown sheets, and exports only cached formula values', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([['wrong'], ['one']]),
        'First',
    );
    const sheet = XLSX.utils.aoa_to_sheet([['chosen'], ['001'], [42]]);
    sheet.A3.f = '21*2';
    XLSX.utils.book_append_sheet(workbook, sheet, 'Applicants');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsed = readDataset(buffer, 'xlsx', { sheet: 'Applicants' });
    expect(parsed.rows).toEqual([['001'], [42]]);
    const exported = XLSX.read(serializeDataset(parsed, 'xlsx'), {
        type: 'buffer',
    });
    expect(exported.SheetNames).toEqual(['Dataset']);
    expect(exported.Sheets.Dataset.A3.f).toBeUndefined();
    expect(() => readDataset(buffer, 'xlsx', { sheet: 'missing' })).toThrow(
        'Requested worksheet',
    );
    expect(() =>
        readDataset(Buffer.from('a\nb'), 'csv', { sheet: 'one' }),
    ).toThrow('CSV does not');
});

it('accepts headers-only datasets and rejects empty/malformed/oversized files', () => {
    expect(readDataset(Buffer.from('a,b\n'), 'csv').rows).toEqual([]);
    for (const input of ['', 'a\n"unclosed', 'a\n"closed"oops', 'a\nb"c'])
        expect(() => readDataset(Buffer.from(input), 'csv')).toThrow();
    expect(() => readDataset(Buffer.from([0xff]), 'csv')).toThrow('UTF-8');
    expect(() =>
        readDataset(Buffer.alloc(FILE_LIMITS.bytes + 1), 'csv'),
    ).toThrow('byte limit');
    expect(() => readDataset(Buffer.from('no workbook'), 'xlsx')).toThrow(
        'Invalid XLSX',
    );
    expect(() => readDataset(Buffer.from('no workbook'), 'xls')).toThrow(
        'Invalid XLS',
    );
    expect(() => fileType('table.txt')).toThrow('Only CSV');
    expect(() =>
        readDataset(
            Buffer.from('a\n' + 'v\n'.repeat(FILE_LIMITS.rows + 1)),
            'csv',
        ),
    ).toThrow('row limit');
    expect(() =>
        readDataset(
            Buffer.from(
                Array(FILE_LIMITS.columns + 1)
                    .fill('a')
                    .join(','),
            ),
            'csv',
        ),
    ).toThrow('column limit');
});

it('rejects oversized expanded archives before parsing', () => {
    const buffer = serializeDataset(table, 'xlsx');
    const central = buffer.indexOf(Buffer.from('504b0102', 'hex'));
    const local = buffer.readUInt32LE(central + 42);
    buffer.writeUInt32LE(FILE_LIMITS.expandedBytes + 1, central + 24);
    buffer.writeUInt32LE(FILE_LIMITS.expandedBytes + 1, local + 22);
    expect(() => readDataset(buffer, 'xlsx')).toThrow('expanded byte limit');
});

it('validates dataset shape and escapes dangerous CSV strings while Excel stores text', () => {
    const data: Dataset = {
        columns: [{ id: 'a', label: '=header' }],
        rows: [['=1+1'], [' +SUM(A1)'], ['@cmd'], ['-001'], ['\tcmd'], [-1]],
    };
    const csv = readDataset(serializeDataset(data, 'csv'), 'csv');
    expect(csv.columns[0].label).toBe("'=header");
    expect(csv.rows).toEqual([
        ["'=1+1"],
        ["' +SUM(A1)"],
        ["'@cmd"],
        ["'-001"],
        ["'\tcmd"],
        ['-1'],
    ]);
    const workbook = XLSX.read(serializeDataset(data, 'xlsx'), {
        type: 'buffer',
    });
    expect(workbook.Sheets.Dataset.A2.t).toBe('s');
    expect(workbook.Sheets.Dataset.A2.f).toBeUndefined();
    for (const invalid of [
        null,
        {},
        { columns: [], rows: [] },
        { columns: data.columns, rows: [[{}]] },
        { columns: data.columns, rows: [[]] },
        { columns: [data.columns[0], data.columns[0]], rows: [] },
    ])
        expect(() => validateDataset(invalid)).toThrow();
});

it.each(['xls', 'xlsx'] as const)(
    'preserves headerless first rows and trailing blank rows in %s',
    (type) => {
        const dataset: Dataset = {
            columns: [{ id: 'a', label: 'value' }],
            rows: [['001'], [null], [null]],
        };
        const buffer = serializeDataset(dataset, type);
        expect(readDataset(buffer, type).rows).toEqual(dataset.rows);
        expect(readDataset(buffer, type, { hasHeaders: false }).rows).toEqual([
            ['value'],
            ...dataset.rows,
        ]);
        expect(
            readDataset(serializeDataset({ ...dataset, rows: [] }, type), type)
                .rows,
        ).toEqual([]);
    },
);

it('rechecks CSV header collisions after formula escaping', () => {
    const columns = [
        { id: 'a', label: '=header' },
        { id: 'b', label: "'=header" },
    ];
    const parsed = readDataset(
        serializeDataset({ columns, rows: [[1, 2]] }, 'csv'),
        'csv',
    );
    expect(parsed.columns.map((col) => col.label)).toEqual([
        "'=header",
        "'=header_2",
    ]);
    expect(
        outputColumns(columns, 'csv').columnMapping.map((col) => col.output),
    ).toEqual(parsed.columns.map((col) => col.label));
});

it('bounds Excel ranges without silently truncating', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['a'], ['v']]);
    sheet['!ref'] = `A1:A${FILE_LIMITS.rows + 2}`;
    XLSX.utils.book_append_sheet(workbook, sheet, 'Large');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    expect(() => readDataset(buffer, 'xlsx')).toThrow('row or column limits');
});

it.each(['csv', 'xls', 'xlsx'] as const)(
    'accepts a synthetic maximum-row dataset in %s',
    (type) => {
        const columns = Array.from(
            { length: Math.min(16, FILE_LIMITS.columns) },
            (_, i) => ({ id: `field${i + 1}`, label: `column${i + 1}` }),
        );
        const dataset: Dataset = {
            columns,
            rows: Array.from({ length: FILE_LIMITS.rows }, (_, row) =>
                columns.map((_, col) =>
                    col === 0 ? String(row).padStart(5, '0') : `value_${col}`,
                ),
            ),
        };
        const buffer = serializeDataset(dataset, type);
        expect(buffer.length).toBeLessThanOrEqual(FILE_LIMITS.bytes);
        const parsed = readDataset(buffer, type);
        expect(parsed.rows).toHaveLength(FILE_LIMITS.rows);
        expect(parsed.rows[0]).toEqual(dataset.rows[0]);
        expect(parsed.rows.at(-1)).toEqual(dataset.rows.at(-1));
    },
);
