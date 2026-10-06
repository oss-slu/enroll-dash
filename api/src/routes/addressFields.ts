import { Router } from 'express';
import { detectAddressFields } from '../utils/addressFields';
import { fileType, readDataset } from '../utils/dataset';
import { readSessionFile, withSession } from '../utils/storage';
import { FileError } from '../errs/file';
import { fileResponseError } from '../utils/fileResponse';

const router = Router();
router.get('/address-fields', async (req, res) => {
    try {
        const { path, sessionId, sheet, hasHeaders } = req.query;
        if (typeof path !== 'string' || !path || typeof sessionId !== 'string')
            throw new FileError(
                400,
                'INVALID_OPTIONS',
                'path and sessionId are required',
            );
        if (sheet !== undefined && typeof sheet !== 'string')
            throw new FileError(400, 'INVALID_SHEET', 'sheet must be a string');
        if (
            hasHeaders !== undefined &&
            hasHeaders !== 'true' &&
            hasHeaders !== 'false'
        )
            throw new FileError(
                400,
                'INVALID_HEADERS',
                'hasHeaders must be true or false',
            );
        const result = await withSession(sessionId, async () => {
            const dataset = readDataset(
                await readSessionFile(sessionId, path),
                fileType(path),
                {
                    sheet: sheet as string | undefined,
                    hasHeaders: hasHeaders !== 'false',
                },
            );
            const candidates = new Set(detectAddressFields(dataset));
            return dataset.columns
                .filter((col) => candidates.has(col.id))
                .map((col) => col.label);
        });
        res.json(result);
    } catch (err) {
        fileResponseError(res, err);
    }
});
export default router;
