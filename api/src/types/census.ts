export type censusBlock = {
    GEOID: string;
    STATE: string;
    COUNTY: string;
    TRACT: string;
    BLKGRP: string;
    BASENAME: string;
}

export type censusAddress = {
    matchedAddress: string;
    coordinates: { x: number; y: number }; // x = lon, y = lat
    geographies: {
        'Census Block Groups'?: censusBlock[];
    };
}

export type censusGeocodeResp = {
    result: {
        input: { address: { address: string } };
        addressMatches: censusAddress[];
    };
}

export type geocodeBlockResult = {
    matchedAddress: string;
    latitude: number;
    longitude: number;
    blockGeoid: string;
    state: string;
    county: string;
    tract: string;
    blkgrp: string;
}
