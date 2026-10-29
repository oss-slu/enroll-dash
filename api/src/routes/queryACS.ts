import { Router, type RequestHandler } from 'express';
import { query } from '../db/connect';
import HttpError from ',,/errs/http';
import { getGeocodeFromAddr } from '../utils/census';
import { validateAddress } from '../utils/validateAddress';

type MetadataRow = {
    table_id: string;
    column_id: string;
};

function parseIds(value: unknown): string[] | null {
    const values = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(values) || !values.length) return null;

    const ids: string[] = [];
    for (const item of values) {
        if (typeof item !== 'string' || !item.trim()) return null;
        ids.push(item.trim().toUpperCase());
    }

    return new Set(ids).size === ids.length ? ids : null;

}

function quoteIdentifier(identifier: string): string {
    return `"${identifier.replaceAll(`"`, `""`)}"`;
}

const router = Router();

const handleQueryACS: RequestHandler = async (req, res) => {
    const input: unknown = req.method === 'POST' ? req.body : req.query;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return res.status(400).json({ ok: false, error: 'Invalid Request. '});
    } 

    const body = input as Record<string, unknown>;
    const hasAddress = body.address !== undefined || body.addr !== undefined;
    const hasGeoid = body.geoid !== undefined;

    if (
        hasAddress === hasGeoid ||
        (body.address !== undefined && body.addr !== undefined)
    ) {
        return res.status(400).json({
            ok: false,
            error: 'Provide exactly one address or geoid',
        });
    }

    let geoid: string | null = null;

    if (hasAddress) {
        const address = body.address ?? body.addr;
        if (typeof address !== 'string' || !address.trim()) {
            return res.status(400).json({
                ok: false,
                error: 'Address must be non-empty string',
            });
        }

        const validation = validateAddress(address);
        if (!validation.ok) {
            return res.status(400).json({
                ...validation,
                error: 'Unsupported address format',
            })
        }
    }
}