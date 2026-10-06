import type { geocodeBlockResult } from '../types/census';
import { FileError } from '../errs/file';
import { validateAddress } from './validateAddress';
import { FILE_LIMITS } from './fileLimits';
import { validateDataset, type Dataset, type Column } from './dataset';

export const GEOCODE_FIELDS = [
    'matchedAddress',
    'latitude',
    'longitude',
    'blockGeoid',
    'state',
    'county',
    'tract',
    'blkgrp',
] as const;
export type GeocodeField = (typeof GEOCODE_FIELDS)[number];
export type EnrichOptions = { fields: GeocodeField[]; join: 'left' | 'inner' };
export type Geocoder = (
    address: string,
    signal: AbortSignal,
) => Promise<geocodeBlockResult | null>;

export function parseEnrichOptions(
    body: Record<string, unknown>,
): EnrichOptions {
    const fields =
        body.fields === undefined ? [...GEOCODE_FIELDS] : body.fields;
    const join = body.join === undefined ? 'left' : body.join;
    if (
        !Array.isArray(fields) ||
        !fields.length ||
        fields.some((field) => !GEOCODE_FIELDS.includes(field)) ||
        new Set(fields).size !== fields.length
    )
        throw new FileError(
            400,
            'INVALID_FIELDS',
            'fields must be a nonempty array of unique known geocoder fields',
        );
    if (join !== 'left' && join !== 'inner')
        throw new FileError(400, 'INVALID_JOIN', 'join must be left or inner');
    return { fields, join };
}

export function abortError(signal: AbortSignal): FileError {
    return signal.reason instanceof FileError
        ? signal.reason
        : new FileError(504, 'CANCELLED', 'File operation was cancelled');
}
export function checkAbort(signal: AbortSignal): void {
    if (signal.aborted) throw abortError(signal);
}

async function cancellable<T>(
    work: Promise<T>,
    signal: AbortSignal,
): Promise<T> {
    checkAbort(signal);
    let listener: () => void;
    const aborted = new Promise<never>((_, reject) => {
        listener = () => reject(abortError(signal));
        signal.addEventListener('abort', listener, { once: true });
    });
    try {
        return await Promise.race([work, aborted]);
    } finally {
        signal.removeEventListener('abort', listener!);
    }
}

export async function enrichDataset(
    dataset: Dataset,
    addressId: string,
    options: EnrichOptions,
    geocoder: Geocoder,
    signal: AbortSignal,
) {
    validateDataset(dataset);
    // Validate even for non-HTTP callers.
    options = parseEnrichOptions(options);
    const addressIndex = dataset.columns.findIndex(
        (col) => col.id === addressId,
    );
    if (addressIndex < 0)
        throw new FileError(
            422,
            'ADDRESS_FIELD_NOT_FOUND',
            'Address column does not exist',
        );
    if (dataset.columns.length + options.fields.length > FILE_LIMITS.columns)
        throw new FileError(
            413,
            'TABLE_TOO_LARGE',
            'Enriched dataset exceeds column limit',
        );
    const valid = dataset.rows.map((row) => {
        const value = row[addressIndex];
        return typeof value === 'string' &&
            value.trim() &&
            validateAddress(value).ok
            ? value
            : null;
    });
    const addresses = [
        ...new Set(valid.filter((value): value is string => value !== null)),
    ];
    if (addresses.length > FILE_LIMITS.uniqueGeocodes)
        throw new FileError(
            413,
            'TOO_MANY_GEOCODES',
            'Dataset exceeds unique geocode limit',
        );
    checkAbort(signal);
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    const outcomes = new Map<string, geocodeBlockResult | null>();
    let cursor = 0;
    try {
        const worker = async () => {
            while (cursor < addresses.length) {
                checkAbort(controller.signal);
                const address = addresses[cursor++];
                const result = await cancellable(
                    Promise.resolve().then(() =>
                        geocoder(address, controller.signal),
                    ),
                    controller.signal,
                );
                outcomes.set(address, result);
            }
        };
        await Promise.all(
            Array.from(
                { length: Math.min(FILE_LIMITS.concurrency, addresses.length) },
                worker,
            ),
        );
        checkAbort(signal);
    } catch (err) {
        controller.abort(err);
        if (err instanceof FileError) throw err;
        const timeout =
            err !== null &&
            typeof err === 'object' &&
            'name' in err &&
            err.name === 'TimeoutError';
        throw new FileError(
            timeout ? 504 : 502,
            'GEOCODER_FAILED',
            'Census geocoding failed; no output was published',
        );
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
    const usedLabels = new Set(dataset.columns.map((col) => col.label));
    const usedIds = new Set(dataset.columns.map((col) => col.id));
    const geocodeColumns: Column[] = options.fields.map((field) => {
        const base = `geocode_${field}`;
        let label = base,
            id = base,
            suffix = 2;
        while (usedLabels.has(label)) label = `${base}_${suffix++}`;
        suffix = 2;
        while (usedIds.has(id)) id = `${base}_${suffix++}`;
        usedLabels.add(label);
        usedIds.add(id);
        return { id, label };
    });
    let matched = 0,
        invalidOrBlank = 0,
        unmatched = 0;
    const rows = dataset.rows.flatMap((row, index) => {
        const address = valid[index];
        const result = address === null ? null : outcomes.get(address);
        if (address === null) invalidOrBlank++;
        else if (result) matched++;
        else unmatched++;
        return options.join === 'inner' && !result
            ? []
            : [
                  [
                      ...row,
                      ...options.fields.map((field) => result?.[field] ?? null),
                  ],
              ];
    });
    return {
        dataset: { columns: [...dataset.columns, ...geocodeColumns], rows },
        geocodeMapping: options.fields.map((field, index) => ({
            field,
            id: geocodeColumns[index].id,
            output: geocodeColumns[index].label,
        })),
        counts: {
            input: dataset.rows.length,
            output: rows.length,
            matched,
            invalidOrBlank,
            unmatched,
        },
    };
}
