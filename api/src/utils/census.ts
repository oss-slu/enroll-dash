import type { censusGeocodeResp, geocodeBlockResult } from '../types/census';
import { CENSUS_GEOCODER_BASE } from '../consts';
import { getJson } from '../utils/http';

export async function getGeocodeFromAddr(
    address: string,
): Promise<geocodeBlockResult | null> {
    const params = new URLSearchParams({
        address,
        benchmark: 'Public_AR_Current',
        vintage: 'Current_Current',
        layers: '10', // layer 10 = Census Block Groups
        format: 'json',
    });

    const url = `${CENSUS_GEOCODER_BASE}?${params.toString()}`;

    const data = await getJson<censusGeocodeResp>(url);

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
    };
}
