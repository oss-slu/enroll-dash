import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { FileError } from '../errs/file';
import { FILE_LIMITS } from './fileLimits';
import { saveSessionFile, validateFilename } from './storage';
import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export type Cell = string | number | boolean | Date | null;
export type Column = { id: string; label: string };
export type Dataset = { columns: Column[]; rows: Cell[][] };
export type FileType = 'csv' | 'xls' | 'xlsx';
export type ReadOptions = { hasHeaders?: boolean; sheet?: string };

// SheetJS' BIFF8 SST continuation writer stalls on an individual item over 8224 bytes.
const XLS_SHARED_STRING_MAX_CHARS = 4110;

export function fileType(filename: string): FileType {
    const ext = path.extname(filename).slice(1).toLowerCase();
    if (ext !== 'csv' && ext !== 'xls' && ext !== 'xlsx')
        throw new FileError(
            415,
            'UNSUPPORTED_FORMAT',
            'Only CSV, XLS and XLSX are supported',
        );
    return ext;
}

export function validateDataset(value: unknown): asserts value is Dataset {
    if (!value || typeof value !== 'object')
        throw new FileError(
            400,
            'INVALID_DATASET',
            'dataset must contain columns and rows',
        );
    const { columns, rows } = value as Dataset;
    if (!Array.isArray(columns) || !Array.isArray(rows) || !columns.length)
        throw new FileError(
            400,
            'INVALID_DATASET',
            'dataset must contain nonempty columns and an array of rows',
        );
    if (columns.length > FILE_LIMITS.columns || rows.length > FILE_LIMITS.rows)
        throw new FileError(
            413,
            'TABLE_TOO_LARGE',
            'Dataset exceeds row or column limits',
        );
    const ids = new Set<string>();
    let textBytes = 0;
    for (const col of columns) {
        if (
            !col ||
            typeof col.id !== 'string' ||
            !col.id ||
            typeof col.label !== 'string' ||
            col.id.length > 200 ||
            col.label.length > FILE_LIMITS.cellChars ||
            ids.has(col.id)
        )
            throw new FileError(
                400,
                'INVALID_DATASET',
                'Columns require unique string IDs and string labels',
            );
        ids.add(col.id);
        textBytes += Buffer.byteLength(col.label);
    }
    for (const row of rows) {
        if (!Array.isArray(row) || row.length !== columns.length)
            throw new FileError(
                400,
                'INVALID_DATASET',
                'Every row must have one cell per column',
            );
        for (const cell of row) {
            if (!(
                cell === null ||
                typeof cell === 'string' ||
                typeof cell === 'boolean' ||
                (typeof cell === 'number' && Number.isFinite(cell)) ||
                (cell instanceof Date && Number.isFinite(cell.getTime()))
            ))
                throw new FileError(
                    400,
                    'INVALID_DATASET',
                    'Unsupported cell value',
                );
            if (typeof cell === 'string' && cell.length > FILE_LIMITS.cellChars)
                throw new FileError(
                    413,
                    'CELL_TOO_LARGE',
                    'Dataset cell exceeds text limit',
                );
            if (typeof cell === 'string') textBytes += Buffer.byteLength(cell);
            if (textBytes > FILE_LIMITS.expandedBytes)
                throw new FileError(
                    413,
                    'TABLE_TOO_LARGE',
                    'Dataset exceeds expanded text byte limit',
                );
        }
    }
}

// Strict CSV grammar avoids SheetJS numeric inference and silently accepted broken quotes.
function parseCsv(buffer: Buffer): Cell[][] {
    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true })
            .decode(buffer)
            .replace(/^\uFEFF/u, '');
    } catch {
        throw new FileError(422, 'UNREADABLE_DATASET', 'CSV must be UTF-8');
    }
    if (!text) return [];
    const rows: Cell[][] = [];
    let row: Cell[] = [],
        cell = '',
        quoted = false,
        closed = false;
    const pushCell = () => {
        if (cell.length > FILE_LIMITS.cellChars)
            throw new FileError(
                413,
                'CELL_TOO_LARGE',
                'Dataset cell exceeds text limit',
            );
        row.push(cell);
        cell = '';
        closed = false;
        if (row.length > FILE_LIMITS.columns)
            throw new FileError(
                413,
                'TABLE_TOO_LARGE',
                'Dataset exceeds column limit',
            );
    };
    const pushRow = () => {
        pushCell();
        rows.push(row);
        row = [];
        if (rows.length > FILE_LIMITS.rows + 1)
            throw new FileError(
                413,
                'TABLE_TOO_LARGE',
                'Dataset exceeds row limit',
            );
    };
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    quoted = false;
                    closed = true;
                }
            } else cell += char;
        } else if (char === ',') pushCell();
        else if (char === '\r' || char === '\n') {
            pushRow();
            if (char === '\r' && text[i + 1] === '\n') i++;
        } else if (char === '"' && !cell && !closed) quoted = true;
        else {
            if (closed || char === '"')
                throw new FileError(
                    422,
                    'UNREADABLE_DATASET',
                    'Malformed CSV quoting',
                );
            cell += char;
        }
    }
    if (quoted)
        throw new FileError(
            422,
            'UNREADABLE_DATASET',
            'Unterminated CSV quote',
        );
    if (cell || row.length || closed || !/[\r\n]$/u.test(text)) pushRow();
    return rows;
}

// Check the ZIP directory before SheetJS allocates expanded workbook entries.
function checkExpandedSize(buffer: Buffer): void {
    let end = -1;
    for (
        let i = buffer.length - 22;
        i >= Math.max(0, buffer.length - 65557);
        i--
    ) {
        if (
            buffer.readUInt32LE(i) === 0x06054b50 &&
            i + 22 + buffer.readUInt16LE(i + 20) === buffer.length
        ) {
            end = i;
            break;
        }
    }
    if (end < 0)
        throw new FileError(422, 'UNREADABLE_DATASET', 'Invalid XLSX archive');
    const count = buffer.readUInt16LE(end + 10);
    let pos = buffer.readUInt32LE(end + 16),
        total = 0;
    if (
        count === 65535 ||
        count > 10000 ||
        buffer.readUInt16LE(end + 4) ||
        buffer.readUInt16LE(end + 6)
    )
        throw new FileError(
            413,
            'WORKBOOK_TOO_LARGE',
            'Unsupported or oversized workbook archive',
        );
    for (let i = 0; i < count; i++) {
        if (pos + 46 > end || buffer.readUInt32LE(pos) !== 0x02014b50)
            throw new FileError(
                422,
                'UNREADABLE_DATASET',
                'Invalid XLSX directory',
            );
        const size = buffer.readUInt32LE(pos + 24);
        const local = buffer.readUInt32LE(pos + 42);
        // Require local and central sizes to agree (or a data descriptor).
        if (
            local + 30 > pos ||
            buffer.readUInt32LE(local) !== 0x04034b50 ||
            (!(buffer.readUInt16LE(local + 6) & 8) &&
                buffer.readUInt32LE(local + 22) !== size)
        )
            throw new FileError(
                422,
                'UNREADABLE_DATASET',
                'Invalid XLSX entry',
            );
        total += size;
        if (size === 0xffffffff || total > FILE_LIMITS.expandedBytes)
            throw new FileError(
                413,
                'WORKBOOK_TOO_LARGE',
                'Workbook exceeds expanded byte limit',
            );
        const compressed = buffer.readUInt32LE(pos + 20);
        const start =
            local +
            30 +
            buffer.readUInt16LE(local + 26) +
            buffer.readUInt16LE(local + 28);
        if (start + compressed > pos || buffer.readUInt16LE(local + 6) & 1)
            throw new FileError(
                422,
                'UNREADABLE_DATASET',
                'Invalid or encrypted XLSX entry',
            );
        const method = buffer.readUInt16LE(pos + 10);
        let actualSize: number;
        try {
            if (method === 0) actualSize = compressed;
            else if (method === 8)
                actualSize = inflateRawSync(
                    buffer.subarray(start, start + compressed),
                    { maxOutputLength: Math.max(1, size) },
                ).length;
            else throw new Error('Unsupported ZIP method');
        } catch {
            throw new FileError(
                422,
                'UNREADABLE_DATASET',
                'Invalid XLSX compressed entry',
            );
        }
        if (actualSize !== size)
            throw new FileError(
                422,
                'UNREADABLE_DATASET',
                'Invalid XLSX expanded size',
            );
        pos +=
            46 +
            buffer.readUInt16LE(pos + 28) +
            buffer.readUInt16LE(pos + 30) +
            buffer.readUInt16LE(pos + 32);
    }
}

export function readDataset(
    buffer: Buffer,
    type: FileType,
    options: ReadOptions = {},
): Dataset {
    if (buffer.length > FILE_LIMITS.bytes)
        throw new FileError(
            413,
            'FILE_TOO_LARGE',
            'Dataset exceeds file byte limit',
        );
    let matrix: Cell[][];
    if (type === 'csv') {
        if (options.sheet !== undefined)
            throw new FileError(
                400,
                'INVALID_SHEET',
                'CSV does not accept a sheet option',
            );
        matrix = parseCsv(buffer);
    } else {
        if (type === 'xlsx') checkExpandedSize(buffer);
        else if (buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1')
            throw new FileError(
                422,
                'UNREADABLE_DATASET',
                'Invalid XLS workbook',
            );
        let workbook: XLSX.WorkBook;
        try {
            workbook = XLSX.read(buffer, {
                type: 'buffer',
                raw: true,
                cellDates: true,
                cellFormula: false,
                cellHTML: false,
                cellText: false,
                sheetRows: FILE_LIMITS.rows + 2,
                WTF: true,
            });
        } catch {
            throw new FileError(
                422,
                'UNREADABLE_DATASET',
                'Unable to read workbook',
            );
        }
        const name = options.sheet ?? workbook.SheetNames[0];
        if (!name || !workbook.SheetNames.includes(name))
            throw new FileError(
                422,
                'INVALID_SHEET',
                'Requested worksheet does not exist',
            );
        const sheet = workbook.Sheets[name];
        const ref = sheet['!fullref'] ?? sheet['!ref'];
        if (ref) {
            const range = XLSX.utils.decode_range(ref);
            if (
                range.e.c >= FILE_LIMITS.columns ||
                range.e.r + 1 >
                    FILE_LIMITS.rows + (options.hasHeaders === false ? 0 : 1)
            )
                throw new FileError(
                    413,
                    'TABLE_TOO_LARGE',
                    'Dataset exceeds row or column limits',
                );
            matrix = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
                header: 1,
                raw: true,
                defval: null,
                blankrows: true,
                range: 0,
            });
        } else matrix = [];
    }
    const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    if (!width)
        throw new FileError(422, 'EMPTY_DATASET', 'Dataset has no columns');
    const headers = options.hasHeaders === false ? undefined : matrix.shift();
    const dataset: Dataset = {
        columns: Array.from({ length: width }, (_, i) => ({
            id: `field${i + 1}`,
            label: headers ? String(headers[i] ?? '') : `field${i + 1}`,
        })),
        rows: matrix.map((row) =>
            Array.from({ length: width }, (_, i) => row[i] ?? null),
        ),
    };
    validateDataset(dataset);
    return dataset;
}

export function readDatasetFile(
    filename: string,
    options: ReadOptions = {},
): Dataset {
    if (fs.statSync(filename).size > FILE_LIMITS.bytes)
        throw new FileError(
            413,
            'FILE_TOO_LARGE',
            'Dataset exceeds file byte limit',
        );
    return readDataset(fs.readFileSync(filename), fileType(filename), options);
}

export function outputColumns(
    columns: Column[],
    type?: FileType,
): {
    columns: Column[];
    columnMapping: { id: string; source: string; output: string }[];
} {
    const used = new Set<string>();
    // Reserve source labels so generated names never steal a later source label.
    const labelFor = (label: string) =>
        type === 'csv' ? csvText(label) : label;
    const reserved = new Set(
        columns.map((col) => labelFor(col.label)).filter(Boolean),
    );
    const columnMapping = columns.map((col) => {
        const base = labelFor(col.label || col.id);
        let output = base,
            suffix = 2;
        while (used.has(output) || (!col.label && reserved.has(output)))
            output = `${base}_${suffix++}`;
        if (output !== base)
            while (reserved.has(output) || used.has(output))
                output = `${base}_${suffix++}`;
        used.add(output);
        return { id: col.id, source: col.label, output };
    });
    return {
        columns: columnMapping.map((col) => ({
            id: col.id,
            label: col.output,
        })),
        columnMapping,
    };
}

function csvText(cell: Cell): string {
    let text =
        cell === null
            ? ''
            : cell instanceof Date
              ? cell.toISOString()
              : String(cell);
    // CSV has no text-cell type. Prefix risky text with an apostrophe; never alter numbers.
    if (typeof cell === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(text))
        text = `'${text}`;
    return text;
}

function csvCell(cell: Cell): string {
    return `"${csvText(cell).replaceAll('"', '""')}"`;
}

export function serializeDataset(dataset: Dataset, type: FileType): Buffer {
    validateDataset(dataset);
    if (type === 'xls' && dataset.rows.length > 65535)
        throw new FileError(
            413,
            'TABLE_TOO_LARGE',
            'XLS supports at most 65535 data rows',
        );
    const { columns } = outputColumns(dataset.columns, type);
    if (
        type === 'xls' &&
        (columns.some(
            (col) => col.label.length > XLS_SHARED_STRING_MAX_CHARS,
        ) ||
            dataset.rows.some((row) =>
                row.some(
                    (cell) =>
                        typeof cell === 'string' &&
                        cell.length > XLS_SHARED_STRING_MAX_CHARS,
                ),
            ))
    )
        throw new FileError(
            413,
            'XLS_TEXT_TOO_LARGE',
            `XLS text exceeds the safe ${XLS_SHARED_STRING_MAX_CHARS} UTF-16 code-unit export limit`,
        );
    const matrix = [columns.map((col) => col.label), ...dataset.rows];
    if (type === 'csv')
        return Buffer.from(
            matrix.map((row) => row.map(csvCell).join(',')).join('\r\n') +
                '\r\n',
        );
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(matrix, { cellDates: true });
    // AOA utilities omit all-null cells. Keep trailing blank row positions in the range.
    sheet['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: matrix.length - 1, c: columns.length - 1 },
    });
    XLSX.utils.book_append_sheet(workbook, sheet, 'Dataset');
    return Buffer.from(
        XLSX.write(workbook, {
            type: 'buffer',
            bookType: type,
            bookSST: type === 'xls',
        }),
    );
}

export async function saveDataset(
    sessionId: string,
    filename: string,
    dataset: Dataset,
    type: FileType,
    signal?: AbortSignal,
) {
    validateFilename(filename);
    if (fileType(filename) !== type)
        throw new FileError(
            400,
            'FORMAT_MISMATCH',
            'filename extension must match format',
        );
    const buffer = serializeDataset(dataset, type);
    if (buffer.length > FILE_LIMITS.bytes)
        throw new FileError(
            413,
            'FILE_TOO_LARGE',
            'Output exceeds file byte limit',
        );
    const outputName = `${path.basename(filename, path.extname(filename)).slice(0, 150)}_${randomUUID()}.${type}`;
    const tempPath = await saveSessionFile(
        sessionId,
        outputName,
        buffer,
        signal,
    );
    return {
        sessionId,
        filename: outputName,
        tempPath,
        format: type,
        columnMapping: outputColumns(dataset.columns, type).columnMapping,
    };
}
