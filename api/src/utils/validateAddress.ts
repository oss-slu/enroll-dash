import type { addressValidationResult } from '../types/census';

type State = {
    abbreviation: string;
    name: string;
};

type ZipParts = {
    remainder: string;
    zip?: string;
};

const STATES: State[] = [
    { abbreviation: 'AL', name: 'Alabama' },
    { abbreviation: 'AK', name: 'Alaska' },
    { abbreviation: 'AZ', name: 'Arizona' },
    { abbreviation: 'AR', name: 'Arkansas' },
    { abbreviation: 'CA', name: 'California' },
    { abbreviation: 'CO', name: 'Colorado' },
    { abbreviation: 'CT', name: 'Connecticut' },
    { abbreviation: 'DE', name: 'Delaware' },
    { abbreviation: 'FL', name: 'Florida' },
    { abbreviation: 'GA', name: 'Georgia' },
    { abbreviation: 'HI', name: 'Hawaii' },
    { abbreviation: 'ID', name: 'Idaho' },
    { abbreviation: 'IL', name: 'Illinois' },
    { abbreviation: 'IN', name: 'Indiana' },
    { abbreviation: 'IA', name: 'Iowa' },
    { abbreviation: 'KS', name: 'Kansas' },
    { abbreviation: 'KY', name: 'Kentucky' },
    { abbreviation: 'LA', name: 'Louisiana' },
    { abbreviation: 'ME', name: 'Maine' },
    { abbreviation: 'MD', name: 'Maryland' },
    { abbreviation: 'MA', name: 'Massachusetts' },
    { abbreviation: 'MI', name: 'Michigan' },
    { abbreviation: 'MN', name: 'Minnesota' },
    { abbreviation: 'MS', name: 'Mississippi' },
    { abbreviation: 'MO', name: 'Missouri' },
    { abbreviation: 'MT', name: 'Montana' },
    { abbreviation: 'NE', name: 'Nebraska' },
    { abbreviation: 'NV', name: 'Nevada' },
    { abbreviation: 'NH', name: 'New Hampshire' },
    { abbreviation: 'NJ', name: 'New Jersey' },
    { abbreviation: 'NM', name: 'New Mexico' },
    { abbreviation: 'NY', name: 'New York' },
    { abbreviation: 'NC', name: 'North Carolina' },
    { abbreviation: 'ND', name: 'North Dakota' },
    { abbreviation: 'OH', name: 'Ohio' },
    { abbreviation: 'OK', name: 'Oklahoma' },
    { abbreviation: 'OR', name: 'Oregon' },
    { abbreviation: 'PA', name: 'Pennsylvania' },
    { abbreviation: 'RI', name: 'Rhode Island' },
    { abbreviation: 'SC', name: 'South Carolina' },
    { abbreviation: 'SD', name: 'South Dakota' },
    { abbreviation: 'TN', name: 'Tennessee' },
    { abbreviation: 'TX', name: 'Texas' },
    { abbreviation: 'UT', name: 'Utah' },
    { abbreviation: 'VT', name: 'Vermont' },
    { abbreviation: 'VA', name: 'Virginia' },
    { abbreviation: 'WA', name: 'Washington' },
    { abbreviation: 'WV', name: 'West Virginia' },
    { abbreviation: 'WI', name: 'Wisconsin' },
    { abbreviation: 'WY', name: 'Wyoming' },
    { abbreviation: 'DC', name: 'District of Columbia' },
    { abbreviation: 'AS', name: 'American Samoa' },
    { abbreviation: 'GU', name: 'Guam' },
    { abbreviation: 'MP', name: 'Northern Mariana Islands' },
    { abbreviation: 'PR', name: 'Puerto Rico' },
    { abbreviation: 'VI', name: 'U.S. Virgin Islands' },
];

const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/u;
const HOUSE_NUMBER_SOURCE = String.raw`(?:\d+\s+\d+\/\d+[A-Za-z]?|\d+[A-Za-z]?(?:-(?:\d+[A-Za-z]?|[A-Za-z]+))?)`;
const HOUSE_AND_STREET_PATTERN = new RegExp(
    `^(${HOUSE_NUMBER_SOURCE})\\s+(.+)$`,
    'u',
);
const UNIT_SOURCE = String.raw`(?:#\s*[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*|(?:Apt|Apartment|Unit|Suite|Ste|Floor|Fl|Building|Bldg|Lot|Room|Rm)\.?\s+[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*)`;
const UNIT_PATTERN = new RegExp(`^${UNIT_SOURCE}$`, 'iu');
const INLINE_UNIT_PATTERN = new RegExp(
    String.raw`(?:^|\s)(${UNIT_SOURCE})$`,
    'iu',
);
const LEADING_UNIT_PATTERN = new RegExp(`^(${UNIT_SOURCE})\\s+(.+)$`, 'iu');
const STREET_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}\s.'’&/-]+$/u;
const STATE_SUFFIXES = [...STATES].sort(
    (left, right) =>
        Math.max(right.abbreviation.length, right.name.length) -
        Math.max(left.abbreviation.length, left.name.length),
);
const UNSUPPORTED_STRUCTURE_PATTERN =
    /(?:^|[,\s])(?:URB\.?|Urbanizaci[oó]n|Municipio)(?:$|[,\s])/iu;

function equalIgnoreCase(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0;
}

function findState(value: string): State | undefined {
    return STATES.find(
        (state) =>
            equalIgnoreCase(value, state.abbreviation) ||
            equalIgnoreCase(value, state.name),
    );
}

function findStateSuffix(
    value: string,
): { city: string; matchedStateName: boolean; state: State } | undefined {
    const trimmed = value.trim();
    const exact = findState(trimmed);
    if (exact) {
        return {
            city: '',
            matchedStateName: equalIgnoreCase(trimmed, exact.name),
            state: exact,
        };
    }

    for (const state of STATE_SUFFIXES) {
        if (
            !trimmed
                .toLocaleLowerCase()
                .endsWith(` ${state.name.toLocaleLowerCase()}`)
        ) {
            if (
                !trimmed
                    .toLocaleLowerCase()
                    .endsWith(` ${state.abbreviation.toLocaleLowerCase()}`)
            ) {
                continue;
            }
        }

        const suffix = trimmed
            .toLocaleLowerCase()
            .endsWith(` ${state.name.toLocaleLowerCase()}`)
            ? state.name
            : state.abbreviation;
        const city = trimmed.slice(0, -(suffix.length + 1)).trim();
        if (city) {
            return {
                city,
                matchedStateName: equalIgnoreCase(suffix, state.name),
                state,
            };
        }
    }

    return undefined;
}

function hasStrictSpacing(address: string): boolean {
    return (
        address.length > 0 &&
        address === address.trim() &&
        !/[\t\r\n]/u.test(address) &&
        !/\s{2,}/u.test(address) &&
        !/\s,/u.test(address) &&
        !/,(?! |$)/u.test(address) &&
        !/,\s{2,}/u.test(address) &&
        !/\s\./u.test(address) &&
        !/\.\./u.test(address)
    );
}

function isAddressName(value: string): boolean {
    return (
        value.length > 0 &&
        STREET_TEXT_PATTERN.test(value) &&
        /[\p{L}\p{N}]/u.test(value) &&
        !/\//u.test(value)
    );
}

function isStreetText(value: string): boolean {
    return (
        isAddressName(value) &&
        !/\s+(?:and|at)\s+/iu.test(value) &&
        !/\s+&\s+/u.test(value)
    );
}

function isCity(value: string): boolean {
    return (
        isAddressName(value) &&
        !parseUnit(value) &&
        !/^\d+(?:\s+\d+)*$/u.test(value) &&
        !/\s+\d{4,5}(?:-\d{4})?$/u.test(value)
    );
}

function splitUnitFromLocality(
    value: string,
): { locality: string; unit: string } | undefined {
    const leadingUnit = value.match(LEADING_UNIT_PATTERN);
    if (leadingUnit) {
        return { unit: leadingUnit[1], locality: leadingUnit[2] };
    }

    const trailingUnit = value.match(INLINE_UNIT_PATTERN);
    if (trailingUnit) {
        const locality = value.slice(0, -trailingUnit[1].length).trim();
        if (locality) return { unit: trailingUnit[1], locality };
    }

    return undefined;
}

function splitTrailingZip(value: string): ZipParts {
    // A complete unit owns its numeric identifier, even when it resembles a ZIP.
    if (parseUnit(value) || INLINE_UNIT_PATTERN.test(value)) {
        return { remainder: value };
    }
    if (ZIP_PATTERN.test(value)) return { remainder: '', zip: value };

    const match = value.match(/^(.*?)\s+(\d{5}(?:-\d{4})?)$/u);
    if (!match) return { remainder: value };

    return { remainder: match[1], zip: match[2] };
}

function parseUnit(value: string): boolean {
    return UNIT_PATTERN.test(value);
}

function parseStreet(value: string): boolean {
    const match = value.match(HOUSE_AND_STREET_PATTERN);
    if (!match) return false;

    const streetAndMaybeUnit = match[2];
    const inlineUnit = streetAndMaybeUnit.match(INLINE_UNIT_PATTERN);
    const street = inlineUnit
        ? streetAndMaybeUnit.slice(0, -inlineUnit[1].length).trim()
        : streetAndMaybeUnit;

    return isStreetText(street) && !/^\s*(?:PO|P\.O\.)\s+Box\b/iu.test(street);
}

function parseStreetPrefix(components: string[]): boolean {
    if (components.length < 1 || components.length > 2) return false;
    if (!parseStreet(components[0])) return false;

    return components.length === 1 || parseUnit(components[1]);
}

function parseAddress(address: string): boolean {
    if (
        !hasStrictSpacing(address) ||
        UNSUPPORTED_STRUCTURE_PATTERN.test(address)
    ) {
        return false;
    }

    const components = address.split(',').map((component) => component.trim());
    if (components.some((component) => component.length === 0)) return false;

    let zip: string | undefined;
    const lastIndex = components.length - 1;
    const trailingZip = splitTrailingZip(components[lastIndex]);
    if (trailingZip.zip) {
        zip = trailingZip.zip;
        if (trailingZip.remainder) {
            components[lastIndex] = trailingZip.remainder;
        } else {
            components.pop();
        }
    }

    const lastComponent = components.at(-1);
    // A terminal unit such as "Suite Maine" is a unit, even though its
    // identifier also spells a state. Do not classify it as a state suffix.
    const stateSuffix =
        lastComponent && !parseUnit(lastComponent)
            ? findStateSuffix(lastComponent)
            : undefined;
    // A full state name can end a street name (for example, "123 Avenue Indiana").
    // A state abbreviation alone is not a street name, so it must not mask a
    // malformed locality such as "123 IN".
    const streetOnlyStateName = Boolean(
        components.length === 1 &&
        lastComponent &&
        stateSuffix?.city &&
        stateSuffix.matchedStateName &&
        parseStreet(lastComponent),
    );

    if (stateSuffix?.state && !streetOnlyStateName) {
        let prefix: string[];
        let city: string;
        if (stateSuffix.city) {
            prefix = components.slice(0, -1);
            city = stateSuffix.city;
        } else {
            if (components.length < 2) return false;
            city = components.at(-2) ?? '';
            prefix = components.slice(0, -2);
        }

        // Units can appear inline next to the city and must be moved back to
        // the street prefix before deciding whether the remaining locality
        // is a city. This also prevents a unit identifier from standing in
        // for a missing city.
        const unitAndCity = splitUnitFromLocality(city);
        if (unitAndCity) {
            prefix = [...prefix, unitAndCity.unit];
            city = unitAndCity.locality;
        }
        if (!isCity(city)) return false;

        return parseStreetPrefix(prefix);
    }

    if (!zip && components.length > 2) return false;
    return parseStreetPrefix(components);
}

function normalizeForSuggestion(address: string): string {
    let normalized = address.trim().replace(/\s+/gu, ' ');
    normalized = normalized.replace(/\s*,\s*/gu, ', ');
    normalized = normalized.replace(/#\s+(?=[A-Za-z0-9])/gu, '#');
    normalized = normalized.replace(
        /\b(Apt|Apartment|Unit|Suite|Ste|Floor|Fl|Building|Bldg|Lot|Room|Rm)\s*\.\s*(?=[A-Za-z0-9])/giu,
        '$1. ',
    );
    normalized = normalized.replace(
        /\b(N|S|E|W|NE|NW|SE|SW)\.{2,}(?=\s|,|$)/giu,
        '$1.',
    );
    normalized = normalized.replace(
        /\b(Apt|Apartment|Unit|Suite|Ste|Floor|Fl|Building|Bldg|Lot|Room|Rm)\.{2,}(?=\s|,|$)/giu,
        '$1.',
    );

    const components = normalized.split(',');
    if (components.length > 1) {
        let localityIndex = components.length - 1;
        if (ZIP_PATTERN.test(components[localityIndex].trim())) {
            localityIndex -= 1;
        }

        // Keep state-abbreviation cleanup within a locality component. In
        // particular, initials in the street name are meaningful content.
        if (localityIndex > 0) {
            const correctedLocality = normalizeStateAbbreviation(
                components[localityIndex],
            );
            if (correctedLocality !== components[localityIndex]) {
                const candidateComponents = [...components];
                candidateComponents[localityIndex] = correctedLocality;
                const candidate = candidateComponents.join(',');

                // A state-looking token is only a safe correction when the
                // complete address confirms a street, a city, and the state.
                if (parseAddress(candidate)) {
                    components[localityIndex] = correctedLocality;
                    normalized = components.join(',');
                }
            }
        }
    }

    return normalized;
}

function normalizeStateAbbreviation(locality: string): string {
    let normalized = locality.replace(
        /(^|\s)([A-Za-z])\.\s*([A-Za-z])\.(?=(?:\s+\d{5}(?:-\d{4})?)?$)/u,
        (match, separator: string, first: string, second: string) =>
            normalizeStateToken(`${first}${second}`, separator, match),
    );
    normalized = normalized.replace(
        /(^|\s)([A-Za-z]{2})\.{1,}(?=(?:\s+\d{5}(?:-\d{4})?)?$)/u,
        (match, separator: string, abbreviation: string) =>
            normalizeStateToken(abbreviation, separator, match),
    );

    return normalized;
}

function normalizeStateToken(
    token: string,
    separator: string,
    original: string,
): string {
    const state = findState(token);
    return state ? `${separator}${state.abbreviation}` : original;
}

export function validateAddress(address: string): addressValidationResult {
    const original = address;
    if (parseAddress(original)) return { ok: true, original };

    const suggested = normalizeForSuggestion(original);
    if (suggested !== original && parseAddress(suggested)) {
        return { ok: false, original, suggested };
    }

    return { ok: false, original };
}
