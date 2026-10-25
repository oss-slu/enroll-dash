import { Router } from 'express';
import { query } from '../db/connect';

const router = Router();

router.get('/acs-metadata', async (_req, res) => {
    const rawTables = _req.query.tables;
    const tables = (Array.isArray(rawTables) ? rawTables : [rawTables])
        .filter((table): table is string => typeof table === 'string')
        .map((table) => table.trim().toLowerCase())
        .filter(Boolean);

    if (tables.length === 0) {
        return res.status(400).json({
            ok: false,
            message: 'No usable table IDs provided.',
        });
    }
    try {
        const result = await query(
            `
            select a.table_id, b.table_title, a.column_id, a.column_title 
            from acs.census_column_metadata a
            join acs.census_table_metadata b on b.table_id = a.table_id
            where lower(a.table_id) like any($1::text[])
            order by a.table_id, a.column_id`,
            [
                tables.map((table) =>
                    table
                        .replace(/%/g, '\\%')
                        .replace(/_/g, '\\_')
                        .replace(/\\%/g, '%')
                        .replace(/\\_/g, '_'),
                ),
            ],
        );
        res.json({
            ok: true,
            data: result.rows,
        });
    } catch (err) {
        res.status(500).json({
            ok: false,
            message: `ACS metadata query failed: ${err}`,
        });
    }
});

export default router;
