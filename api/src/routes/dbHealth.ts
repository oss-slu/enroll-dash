import { Router } from 'express';
import { query } from '../db/connect';

const router = Router();

router.get('/db-health', async (_req, res) => {
    try {
        await query('select * from acs.census_table_metadata');
        res.json({
            ok: true,
            message: `database connection established`,
        });
    } catch (err) {
        res.json({
            ok: false,
            message: `database health check failed: ${err}`,
        });
    }
});

export default router;
