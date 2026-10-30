import { Router, type RequestHandler } from 'express';
import { query } from '../db/connect';
import HttpError from '../errs/http';
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
            });
        }

        try {
            const match = await getGeocodeFromAddr(validation.original);
            if (!match) {
                return res.status(404).json({
                    ok: false,
                    error: 'No address matches for ${address}',
                });
            }

            geoid = match.blockGeoid;
        } catch (err) {
            const error = 
                err instanceof HttpError
                    ? `Census API error: ${err.status} ${err.statusText}`
                    : 'Census geocoder request failed';

            return res.status(502).json({ ok: false, error });
        }
    } else if (typeof body.geoid === 'string') {
        geoid = body.geoid.trim();
    }

    const geoidMatch = /^(?:15000US)?(\d{12})$/iu.exec(geoid ?? '');
    if (!geoidMatch) {
        return res.status(400).json({
            ok: false,
            error: 'geoid must be a 12-digit block-group GEOID',
        });
    }

    const normalizedGeoid = `15000US${geoidMatch[1]}`;

    const tables = parseIds(body.tables);
    const columns = parseIds(body.columns);
    if (!tables || !columns) {
        return res.status(400).json({
            ok: false,
            error: 'tables and columns must be nonempty arrays of unique IDs',
        });
    }

    try {
        const metadata = await query<MetadataRow>(
            `select lower(table_id) as table_id, lower(column_id) as column_id
            from acs.census_column_metadata
            where lower(table_id) = any($1::text[])
                and lower(column_id) = any($2::text[])`,
            [
                tables.map((table) => table.toLowerCase()),
                columns.map((column) => column.toLowerCase()),
            ],
        );

        const select = metadata.rows.filter(
            (rows) =>
                tables.some((table) => table.toLowerCase() === rows.table_id) &&
            columns.some((column) => column.toLowerCase() === rows.column_id),
        );

        const allTablesHaveColumns = tables.every((table) =>
            select.some((row) => row.table_id === table.toLowerCase()),
        );

        const allColumnsAreValid = columns.every((column) =>
            select.some((row) => row.column_id === column.toLowerCase()),
        );

        if (!select.length || !allTablesHaveColumns || !allColumnsAreValid) {
            return res.status(400).json({
                ok: false,
                error: 'Each requested column must belong to a requested ACS table',
            });
        }

        const selections = [
            `${quoteIdentifier('t0')}.${quoteIdentifier('geoid')} as ${quoteIdentifier('geoid')}`,
        ];

        const from = tables.map((tableId, index) => {
            const table = tableId.toLowerCase();
            const alias = `t${index}`;

            for (const columnId of columns) {
                const column = columnId.toLowerCase();

                if(
                    select.some(
                        (row) =>
                            row.table_id === table &&
                            row.column_id === column,
                    )
                ) {
                    selections.push(
                        `${quoteIdentifier(alias)}.${quoteIdentifier(column)} as ${quoteIdentifier(columnId)}`,
                    );
                }
            }

            const tableRef =
                `${quoteIdentifier('acs')}.${quoteIdentifier(table)} as ${quoteIdentifier(alias)}`;
            
                if (index == 0) return tableRef;
                return `join ${tableRef} on ${quoteIdentifier('t0')}.${quoteIdentifier('geoid')} = ${quoteIdentifier(alias)}.${quoteIdentifier('geoid')}`;
        });

        const result = await query(
            `select ${selections.join(', ')}
            from ${from.join('\n')}
            where ${quoteIdentifier('t0')}.${quoteIdentifier('geoid')} = $1
            `,
            [normalizedGeoid],
        );

        if (!result.rows.length) {
            return res.status(404).json({
                ok: false,
                error: `No ACS data found for GEOID ${normalizedGeoid}`,
            });
        }

        return res.json({
            ok: true,
            geoid: normalizedGeoid,
            data: result.rows[0],
        });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: `ACS query failed: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
};

router.get('/query-acs', handleQueryACS)
router.post('/query-acs', handleQueryACS);

export default router;