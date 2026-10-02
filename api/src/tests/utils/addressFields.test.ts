import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { findAddressFields } from '../../utils/addressFields';

describe('findAddressFields', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'address-fields-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('finds a valid address field in a CSV file', () => {
        const filePath = path.join(tempDir, 'addresses.csv');

        fs.writeFileSync(
            filePath,
            [
                'name,address,city',
                'Darcy,"6957 Chippewa St, Saint Louis, MO 63109",St. Louis',
            ].join('\n'),
        );

        expect(findAddressFields(filePath)).toEqual(['address']);
    });

    it('finds fields with common address header names', () => {
        const filePath = path.join(tempDir, 'addresses.csv');

        fs.writeFileSync(
            filePath,
            [
                'name,addr,mailing address',
                'Darcy,"6957 Chippewa St, Saint Louis, MO 63109","1 N. Grand Blvd, Saint Louis, MO 63103"',
            ].join('\n'),
        );

        expect(findAddressFields(filePath)).toEqual([
            'addr',
            'mailing address',
        ]);
    });

    it('finds an address even when the field name does not suggest an address', () => {
        const filePath = path.join(tempDir, 'addresses.csv');

        fs.writeFileSync(
            filePath,
            [
                'name,location,city',
                'Darcy,"6957 Chippewa St, Saint Louis, MO 63109",St. Louis',
            ].join('\n'),
        );

        expect(findAddressFields(filePath)).toEqual(['location']);
    });

    it('does not return a field when its first value is not a valid address', () => {
        const filePath = path.join(tempDir, 'addresses.csv');

        fs.writeFileSync(
            filePath,
            ['name,address', 'Darcy,Not an address'].join('\n'),
        );

        expect(findAddressFields(filePath)).toEqual([]);
    });

    it('finds an address field in an Excel file', () => {
        const filePath = path.join(tempDir, 'addresses.xlsx');

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([
            ['name', 'address'],
            ['Darcy', '1 N. Grand Blvd, Saint Louis, MO 63103'],
        ]);

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        XLSX.writeFile(workbook, filePath);

        expect(findAddressFields(filePath)).toEqual(['address']);
    });

    it('returns no matches for an empty file', () => {
        const filePath = path.join(tempDir, 'empty.csv');

        fs.writeFileSync(filePath, '');

        expect(findAddressFields(filePath)).toEqual([]);
    });
});
