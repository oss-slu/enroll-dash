import { getJSON } from "../getClient.ts";

const CENSUS_GEOCODER_BASE = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

interface censusBlock {
    GEOID: string;
    STATE: string;
    COUNTY: string;
    TRACT: string;
    BLKGRP: string;
    BASENAME: string;
}

interface censusAddress {
    matchedAddress: string;
    coordinates: { x: number; y: number }; // x = lon, y = lat
    geographies: {
        "Census Block Groups"?: censusBlock[];
    }
}

interface censusGeocodeResp {
    result: {
        input: { address: { address: string } };
        addressMatches: censusAddress[];
    };
}

export interface geocodeBlockResult {
    matchedAddress: string;
    latitude: number;
    longitude: number;
    blockGeoid: string;
    state: string;
    county: string;
    tract: string;
    blkgrp: string;
}

export async function getGeocodeFromAddr(address: string): Promise<geocodeBlockResult | null> {
    const params = new URLSearchParams({
        address,
        benchmark: "Public_AR_Current",
        vintage: "Current_Current",
        layers: "10", // layer 10 = Census Block Groups
        format: "json",
    });

    const url = `${CENSUS_GEOCODER_BASE}?${params.toString()}`;

    const data = await getJSON<censusGeocodeResp>(url);
    
    const match = data.result.addressMatches[0];
    if (!match) return null;
    
    const block = match.geographies['Census Block Groups']?.[0];
    if (!block) return null;

    return {
        matchedAddress: match.matchedAddress,
        latitude: match.coordinates.y,
        longitude: match.coordinates.x,
        blockGeoid: block.GEOID,
        state: block.STATE,
        county: block.COUNTY,
        tract: block.TRACT, 
        blkgrp: block.BLKGRP,
    }
}
