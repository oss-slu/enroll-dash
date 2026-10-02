import * as XLSX from 'xlsx';
import { validateAddress } from './validateAddress';

export function findAddressFields(filePath: string): string[] {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
        return [];
    }

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
    });

    if (rows.length === 0) {
        return [];
    }

    const headers = Object.keys(rows[0]);
    const potentialMatches: string[] = [];

    for (const header of headers) {
        const firstValue = rows[0][header];

        if (typeof firstValue !== 'string' || !firstValue.trim()) {
            continue;
        }

        const validation = validateAddress(firstValue);

        if (validation.ok) {
            potentialMatches.push(header);
        }
    }

    return potentialMatches;
}
