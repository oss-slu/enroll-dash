import path from 'node:path';
import { FileError } from '../errs/file';
import { getGeocodeFromAddr } from './census';
import { readSessionFile, validateSessionId, withSession } from './storage';
import {
    fileType,
    readDataset,
    saveDataset,
    type ReadOptions,
} from './dataset';
import { detectAddressFields } from './addressFields';
import {
    abortError,
    enrichDataset,
    parseEnrichOptions,
    type Geocoder,
} from './enrichDataset';
import { FILE_LIMITS } from './fileLimits';

export type FileOptions = ReadOptions & {
    sessionId: string;
    addressField?: string;
    fields?: unknown;
    join?: unknown;
};

export function parseFileOptions(value: unknown): FileOptions {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new FileError(
            400,
            'INVALID_OPTIONS',
            'A JSON options object is required',
        );
    const body = value as Record<string, unknown>;
    validateSessionId(body.sessionId as string);
    parseEnrichOptions(body);
    if (body.hasHeaders !== undefined && typeof body.hasHeaders !== 'boolean')
        throw new FileError(
            400,
            'INVALID_HEADERS',
            'hasHeaders must be a boolean',
        );
    for (const key of ['sheet', 'addressField'])
        if (
            body[key] !== undefined &&
            (typeof body[key] !== 'string' || !body[key])
        )
            throw new FileError(
                400,
                'INVALID_OPTIONS',
                `${key} must be a nonempty string`,
            );
    return body as FileOptions;
}

export async function enrichFile(
    inputPath: string,
    rawOptions: unknown,
    signal?: AbortSignal,
    geocoder: Geocoder = (address, signal) =>
        getGeocodeFromAddr(address, { signal }),
) {
    const options = parseFileOptions(rawOptions);
    const controller = new AbortController();
    const expires = Date.now() + FILE_LIMITS.durationMs;
    const deadline = () =>
        controller.abort(
            new FileError(
                504,
                'DEADLINE_EXCEEDED',
                'File enrichment exceeded its deadline',
            ),
        );
    const timer = setTimeout(deadline, FILE_LIMITS.durationMs);
    const cancelled = () =>
        controller.abort(
            new FileError(504, 'CANCELLED', 'File enrichment was cancelled'),
        );
    if (signal?.aborted) cancelled();
    signal?.addEventListener('abort', cancelled, { once: true });
    const check = () => {
        if (Date.now() >= expires) deadline();
        if (controller.signal.aborted) throw abortError(controller.signal);
    };
    try {
        return await withSession(options.sessionId, async () => {
            check();
            const type = fileType(inputPath);
            const dataset = readDataset(
                await readSessionFile(options.sessionId, inputPath),
                type,
                options,
            );
            check();
            let addressId: string;
            if (options.addressField !== undefined) {
                const idMatch = dataset.columns.find(
                    (col) => col.id === options.addressField,
                );
                const columns = idMatch
                    ? [idMatch]
                    : dataset.columns.filter(
                          (col) => col.label === options.addressField,
                      );
                if (columns.length !== 1)
                    throw new FileError(
                        422,
                        'ADDRESS_FIELD_NOT_FOUND',
                        'Select one address column by its unique ID or label',
                    );
                addressId = columns[0].id;
            } else {
                const candidates = detectAddressFields(dataset);
                if (candidates.length !== 1)
                    throw new FileError(
                        422,
                        candidates.length
                            ? 'AMBIGUOUS_ADDRESS_FIELDS'
                            : 'NO_ADDRESS_FIELDS',
                        'Specify addressField using one column ID',
                        candidates,
                    );
                addressId = candidates[0];
            }
            const enriched = await enrichDataset(
                dataset,
                addressId,
                parseEnrichOptions(options),
                geocoder,
                controller.signal,
            );
            check();
            const saved = await saveDataset(
                options.sessionId,
                `${path.basename(inputPath, path.extname(inputPath))}_geocoded.${type}`,
                enriched.dataset,
                type,
                controller.signal,
            );
            return {
                ...saved,
                addressField: addressId,
                geocodeMapping: enriched.geocodeMapping.map((col) => ({
                    ...col,
                    output: saved.columnMapping.find(
                        (mapping) => mapping.id === col.id,
                    )!.output,
                })),
                counts: enriched.counts,
            };
        });
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancelled);
    }
}
