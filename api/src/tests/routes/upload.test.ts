import request from 'supertest';
import { createApp } from '../../app';
import fs from 'fs';
import path from 'path';

const app = createApp();

describe('Upload API', () => {
    let createdSessionId: string;
    let tempFilePath: string;

    it('uploads a valid CSV file and creates a temp directory', async () => {
        const fileBuffer = Buffer.from('col1,col2\nval1,val2');

        const res = await request(app)
            .post('/upload')
            .attach('file', fileBuffer, 'test.csv');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.sessionId).toBeDefined();
        expect(res.body.tempPath).toBeDefined();

        createdSessionId = res.body.sessionId;
        tempFilePath = res.body.tempPath;

        const fileExists = fs.existsSync(tempFilePath);
        expect(fileExists).toBe(true);
    });

    it('rejects invalid file types', async () => {
        const fileBuffer = Buffer.from('text content');

        const res = await request(app)
            .post('/upload')
            .attach('file', fileBuffer, 'test.txt');

        expect(res.status).toBe(500);
    });

    it('returns 400 when no file is attached', async () => {
        const res = await request(app).post('/upload');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('No valid file uploaded');
    });

    it('cleans up the session directory', async () => {
        const res = await request(app).delete(`/upload/${createdSessionId}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const dirPath = path.join('/tmp', 'enroll-dash', createdSessionId);
        expect(fs.existsSync(dirPath)).toBe(false);
    });
});
