import { jest } from '@jest/globals';
import type { censusGeocodeResp } from '../../types/census';
import { validateAddress } from '../../utils/validateAddress';

describe('validateAddress', () => {
    it.each([
        '6957 Chippewa St, Apt. 2E, Saint Louis, MO 63109',
        '6957 Chippewa St, Saint Louis, MO 63109',
        '1 N. Grand Blvd, Saint Louis, MO 63103',
        '1 N. Grand Blvd, Saint Louis, MO 63108',
    ])('accepts the issue example unchanged: %s', (address) => {
        expect(validateAddress(address)).toEqual({
            ok: true,
            original: address,
        });
    });

    it.each([
        '123 N. Grand Blvd, Apt. 2E, Saint Louis, MO 63103',
        '123 South Main Street, Apt 2E, Saint Louis, MO 63103',
        '123 Southwest Main Street, Suite 200, Saint Louis, MO 63103',
        "12-14 O'Fallon St, Saint Louis, MO 63103",
        '12A Martin Luther King Jr Blvd, Saint Louis, MO 63103',
        '12-A AT&T Way, Saint Louis, MO 63103',
        "12 1/2 Rue de l'Église, Montréal, MO 63103",
        '100 1st Avenue SW, Saint Louis, MO 63103',
        '123 Main Street, #2E, Saint Louis, MO 63103',
    ])(
        'accepts units, directionals, names, and number forms: %s',
        (address) => {
            expect(validateAddress(address)).toEqual({
                ok: true,
                original: address,
            });
        },
    );

    it.each([
        '123 Main St',
        '123 Main St, Apt 2E',
        '123 Main St, 01234',
        '123 Indiana',
        '123 Indiana, 01234',
        '123 Indiana, Town, MO',
        '123 Maine',
        '123 Georgia',
        '123 Main St, St. Louis, mo 01234',
        '123 Main St, St. Louis, Missouri',
        '99999 Ωmega-Zone Way, Nowhereville, MO 00001-1234',
        '123 Main St, St Louis MO 63109',
    ])(
        'accepts supported locality forms without checking geographic truth: %s',
        (address) => {
            expect(validateAddress(address).ok).toBe(true);
        },
    );

    it.each([
        '123 Main St, Town and Country, MO 63017',
        '123 Main St, Town and Country MO 63017',
        '123 Avenue Indiana',
        '123 Avenue Indiana, 01234',
        '123 Avenue Indiana, Town, MO',
        '123 Avenue New York',
        '123 Avenue New York, 01234',
    ])('preserves supported city and street names: %s', (address) => {
        expect(validateAddress(address)).toEqual({
            ok: true,
            original: address,
        });
    });

    it.each([
        '123 Main St, Washington, DC 20001',
        '123 Main St, Washington DC 20001',
        '123 Main St, New York, NY 10001',
        '123 Main St, New York NY 10001',
        '123 Main St, Washington, District of Columbia',
    ])('accepts a city name that also names a state: %s', (address) => {
        expect(validateAddress(address)).toEqual({
            ok: true,
            original: address,
        });
    });

    it.each([
        '123 Main St, Apt 12345',
        '123 Main St, Suite 01234',
        '123 Main St, #12345',
        '123 Main St Apt 12345',
        '123 Main St, Apt 12345, 63109',
        '123 Main St, Apt 12345 63109',
        '123 Main St, Apt 12345, Saint Louis, MO 63109',
    ])('preserves numeric unit identifiers: %s', (address) => {
        expect(validateAddress(address)).toEqual({
            ok: true,
            original: address,
        });
    });

    it.each([
        [
            '  123  Main St,  St Louis,  MO 63109 ',
            '123 Main St, St Louis, MO 63109',
        ],
        [' 123 M. E. Smith St, Town, MO ', '123 M. E. Smith St, Town, MO'],
        ['123 Main St,St Louis,MO 63109', '123 Main St, St Louis, MO 63109'],
        [
            '123 Main St , St Louis , MO 63109',
            '123 Main St, St Louis, MO 63109',
        ],
        [
            '1 N.. Grand Blvd, St. Louis, M.O. 63103',
            '1 N. Grand Blvd, St. Louis, MO 63103',
        ],
        [
            '123 Main St, Apt . 2E, St Louis, MO 63109',
            '123 Main St, Apt. 2E, St Louis, MO 63109',
        ],
    ])(
        'suggests only a safe formatting correction: %s',
        (input, suggestion) => {
            const result = validateAddress(input);

            expect(result).toEqual({
                ok: false,
                original: input,
                suggested: suggestion,
            });
            expect(validateAddress(suggestion)).toEqual({
                ok: true,
                original: suggestion,
            });
        },
    );

    it.each([
        '123 IN',
        '123 IN, 01234',
        '123 Main Street St Louis MO 63109',
        '123 Main St Saint Louis, MO 63109',
        '123 Main St, Saint Louis, MO 6310',
        '123 Main St, Saint Louis, MO 63109-123',
        '123, Saint Louis, MO 63109',
        '123 Main St, Saint Louis 6310, MO',
    ])('does not guess at ambiguous or malformed input: %s', (address) => {
        expect(validateAddress(address)).toEqual({
            ok: false,
            original: address,
        });
    });

    it.each([
        'PO Box 123, Saint Louis, MO 63109',
        'RR 2 Box 123, Saint Louis, MO 63109',
        'APO AE 09012',
        '123 Main St & 1st Ave, Saint Louis, MO 63109',
        '123 Main St and 1st Ave, Saint Louis, MO 63109',
        '123 Main St at 1st Ave, Saint Louis, MO 63109',
        '10 Downing St, London, UK',
        '123 Calle Principal, URB Jardines, San Juan, PR 00901',
    ])(
        'rejects an unsupported address structure without a suggestion: %s',
        (address) => {
            expect(validateAddress(address)).toEqual({
                ok: false,
                original: address,
            });
        },
    );

    it('preserves the original string and never changes meaningful content in a suggestion', () => {
        const original = " 12-14  O'Fallon St , St Louis , mo 01234-5678 ";
        const result = validateAddress(original);

        expect(result.original).toBe(original);
        expect(result.suggested).toBe(
            "12-14 O'Fallon St, St Louis, mo 01234-5678",
        );
        expect(result.suggested).toContain("12-14 O'Fallon");
        expect(result.suggested).toContain('01234-5678');
    });

    it('passes a validated original address unchanged to the Census request boundary', async () => {
        const getJson = jest
            .fn<(url: string) => Promise<censusGeocodeResp>>()
            .mockResolvedValue({
                result: {
                    input: { address: { address: '' } },
                    addressMatches: [
                        {
                            matchedAddress:
                                '6957 Chippewa St, Saint Louis, MO 63109',
                            coordinates: { x: -90, y: 38 },
                            geographies: {
                                'Census Block Groups': [
                                    {
                                        GEOID: '290000000000',
                                        STATE: '29',
                                        COUNTY: '189',
                                        TRACT: '000000',
                                        BLKGRP: '1',
                                        BASENAME: '1',
                                    },
                                ],
                            },
                        },
                    ],
                },
            });
        jest.unstable_mockModule('../../utils/http', () => ({ getJson }));

        const { getGeocodeFromAddr } = await import('../../utils/census');
        const original = '6957 Chippewa St, Saint Louis, MO 63109';
        const validation = validateAddress(original);

        expect(validation.ok).toBe(true);
        await getGeocodeFromAddr(validation.original);

        const requestUrl = new URL(getJson.mock.calls[0][0] as string);
        expect(requestUrl.searchParams.get('address')).toBe(original);
    });
});
