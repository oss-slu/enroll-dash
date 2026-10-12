import { jest } from '@jest/globals';
import type { geocodeBlockResult } from '../../types/census';
import { enrichDataset, type Geocoder } from '../../utils/enrichDataset';
import type { Dataset } from '../../utils/dataset';
import { FILE_LIMITS } from '../../utils/fileLimits';

const a = '123 Main St, Saint Louis, MO 63103';
const b = '456 Other St, Saint Louis, MO 63103';
const result: geocodeBlockResult = {
    matchedAddress: 'STANDARDIZED',
    latitude: 38,
    longitude: -90,
    blockGeoid: '001234567890',
    state: '01',
    county: '003',
    tract: '000100',
    blkgrp: '1',
};
const table: Dataset = {
    columns: [
        { id: 'name', label: 'name' },
        { id: 'address', label: 'address' },
        { id: 'old', label: 'geocode_state' },
    ],
    rows: [
        ['first', a, 'keep'],
        ['second', b, 'keep'],
        ['duplicate', a, 'keep'],
        ['invalid', 'not an address', 'keep'],
        ['blank', '', 'keep'],
        ['suggestion', ` ${a} `, 'keep'],
    ],
};
const options = {
    fields: ['state', 'latitude'] as const,
    join: 'left' as const,
};
const opts = () => ({ ...options, fields: [...options.fields] });

it.each(['left', 'inner'] as const)(
    'keeps row order/cardinality with duplicates and out-of-order responses for %s',
    async (join) => {
        const geocoder = jest.fn<Geocoder>(async (address) => {
            if (address === a) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return result;
            }
            return null;
        });
        const enriched = await enrichDataset(
            table,
            'address',
            { ...opts(), join },
            geocoder,
            new AbortController().signal,
        );
        expect(geocoder.mock.calls.map((call) => call[0])).toEqual([a, b]);
        expect(enriched.counts).toEqual({
            input: 6,
            output: join === 'left' ? 6 : 2,
            matched: 2,
            unmatched: 1,
            invalidOrBlank: 3,
        });
        expect(enriched.dataset.rows.map((row) => row[0])).toEqual(
            join === 'left'
                ? table.rows.map((row) => row[0])
                : ['first', 'duplicate'],
        );
        expect(enriched.dataset.rows[0]).toEqual([
            'first',
            a,
            'keep',
            '01',
            38,
        ]);
        if (join === 'left')
            expect(enriched.dataset.rows[3].slice(-2)).toEqual([null, null]);
        expect(enriched.geocodeMapping[0].output).toBe('geocode_state_2');
    },
);

it('returns empty inner datasets when all addresses are unmatched', async () => {
    const enriched = await enrichDataset(
        table,
        'address',
        { ...opts(), join: 'inner' },
        async () => null,
        new AbortController().signal,
    );
    expect(enriched.dataset.rows).toEqual([]);
    expect(enriched.counts.unmatched).toBe(3);
});

it('validates address column and workload before calling Census', async () => {
    const geocoder = jest.fn<Geocoder>();
    await expect(
        enrichDataset(
            table,
            'missing',
            opts(),
            geocoder,
            new AbortController().signal,
        ),
    ).rejects.toMatchObject({ status: 422 });
    const big: Dataset = {
        columns: [{ id: 'address', label: 'address' }],
        rows: Array.from({ length: FILE_LIMITS.uniqueGeocodes + 1 }, (_, i) => [
            `${i + 1} Main St`,
        ]),
    };
    await expect(
        enrichDataset(
            big,
            'address',
            opts(),
            geocoder,
            new AbortController().signal,
        ),
    ).rejects.toMatchObject({ status: 413 });
    expect(geocoder).not.toHaveBeenCalled();
});

it('bounds concurrency and aborts outstanding calls when any upstream request fails', async () => {
    let concurrent = 0,
        peak = 0,
        aborted = 0;
    const data: Dataset = {
        columns: [{ id: 'address', label: 'address' }],
        rows: Array.from({ length: 12 }, (_, i) => [`${i + 1} Main St`]),
    };
    const enriched = await enrichDataset(
        data,
        'address',
        opts(),
        async () => {
            concurrent++;
            peak = Math.max(peak, concurrent);
            await new Promise((resolve) => setTimeout(resolve, 2));
            concurrent--;
            return result;
        },
        new AbortController().signal,
    );
    expect(enriched.counts.matched).toBe(12);
    expect(peak).toBe(FILE_LIMITS.concurrency);
    await expect(
        enrichDataset(
            data,
            'address',
            opts(),
            (address, signal) =>
                new Promise((resolve, reject) => {
                    signal.addEventListener(
                        'abort',
                        () => {
                            aborted++;
                            resolve(null);
                        },
                        { once: true },
                    );
                    if (address === '1 Main St')
                        setTimeout(() => reject(new Error('outage')), 2);
                }),
            new AbortController().signal,
        ),
    ).rejects.toMatchObject({ status: 502 });
    expect(aborted).toBe(FILE_LIMITS.concurrency);
});

it('cancels unresponsive geocoders', async () => {
    const controller = new AbortController();
    const work = enrichDataset(
        table,
        'address',
        opts(),
        () => new Promise(() => {}),
        controller.signal,
    );
    controller.abort();
    await expect(work).rejects.toMatchObject({ status: 504 });
});
