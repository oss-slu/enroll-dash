import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
    saveSessionFile,
    resolveSessionFile,
    readSessionFile,
    deleteSessionDir,
    withSession,
    cleanupExpiredSessions,
} from '../../utils/storage';
import { FILE_LIMITS } from '../../utils/fileLimits';

let root: string, session: string;
const previousRoot = process.env.UPLOAD_TEMP_DIR;
beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-storage-'));
    process.env.UPLOAD_TEMP_DIR = root;
    session = randomUUID();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (previousRoot === undefined) delete process.env.UPLOAD_TEMP_DIR;
    else process.env.UPLOAD_TEMP_DIR = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
});

it('publishes complete files without overwriting and deletes inputs and outputs together', async () => {
    const input = await saveSessionFile(
        session,
        'input.csv',
        Buffer.from('original'),
    );
    const output = await saveSessionFile(
        session,
        'output.csv',
        Buffer.from('derived'),
    );
    expect(await readSessionFile(session, input)).toEqual(
        Buffer.from('original'),
    );
    expect(await resolveSessionFile(session, output)).toBe(output);
    await expect(
        saveSessionFile(session, 'input.csv', Buffer.from('replaced')),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(input, 'utf8')).toBe('original');
    expect(await fs.readdir(path.dirname(input))).toEqual([
        'input.csv',
        'output.csv',
    ]);
    await deleteSessionDir(session);
    await expect(resolveSessionFile(session, input)).rejects.toMatchObject({
        status: 404,
    });
});

it('rejects invalid UUIDs and filenames, traversal, foreign paths, sibling prefixes and cross-session files', async () => {
    for (const id of [
        '..',
        '',
        'https://example.com',
        '../enroll-dash-other',
    ]) {
        await expect(
            saveSessionFile(id, 'a.csv', Buffer.alloc(0)),
        ).rejects.toMatchObject({ status: 400 });
        await expect(deleteSessionDir(id)).rejects.toMatchObject({
            status: 400,
        });
    }
    for (const name of ['../a.csv', '/a.csv', 'a\\b.csv', '.', '..', 'a\0.csv'])
        await expect(
            saveSessionFile(session, name, Buffer.alloc(0)),
        ).rejects.toMatchObject({ status: 400 });
    const input = await saveSessionFile(session, 'input.csv', Buffer.alloc(0));
    const other = await saveSessionFile(
        randomUUID(),
        'other.csv',
        Buffer.alloc(0),
    );
    for (const target of [
        other,
        root,
        root + '-other/input.csv',
        path.dirname(input) + '/../input.csv',
        'https://example.com/a.csv',
    ])
        await expect(resolveSessionFile(session, target)).rejects.toMatchObject(
            { status: 400 },
        );
});

it('refuses symlink files and session directories escaping storage', async () => {
    const input = await saveSessionFile(session, 'a.csv', Buffer.from('a'));
    const target = path.join(root, 'foreign.csv');
    await fs.writeFile(target, 'foreign');
    const linked = path.join(path.dirname(input), 'link.csv');
    await fs.symlink(target, linked);
    await expect(resolveSessionFile(session, linked)).rejects.toMatchObject({
        status: 400,
    });
    const other = randomUUID();
    await fs.symlink(path.dirname(input), path.join(root, other));
    await expect(
        saveSessionFile(other, 'out.csv', Buffer.alloc(0)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(deleteSessionDir(other)).rejects.toMatchObject({
        status: 400,
    });
    expect(await fs.readFile(input, 'utf8')).toBe('a');
});

it('cleans pending output on write/publication failure and respects cancellation', async () => {
    const input = await saveSessionFile(session, 'input.csv', Buffer.from('a'));
    jest.spyOn(fs, 'link').mockRejectedValueOnce(
        new Error('synthetic write failure'),
    );
    await expect(
        saveSessionFile(session, 'output.csv', Buffer.alloc(10)),
    ).rejects.toThrow('synthetic');
    expect(await fs.readdir(path.dirname(input))).toEqual(['input.csv']);
    const controller = new AbortController();
    controller.abort();
    await expect(
        saveSessionFile(
            session,
            'output.csv',
            Buffer.alloc(10),
            controller.signal,
        ),
    ).rejects.toThrow();
    expect(await fs.readdir(path.dirname(input))).toEqual(['input.csv']);
});

it('keeps active sessions during expiration/deletion and expires idle sessions', async () => {
    const input = await saveSessionFile(session, 'input.csv', Buffer.from('a'));
    await withSession(session, async () => {
        await expect(deleteSessionDir(session)).rejects.toMatchObject({
            status: 409,
        });
        await cleanupExpiredSessions(
            Date.now() + FILE_LIMITS.sessionTtlMs + 1000,
        );
        expect(await fs.readFile(input, 'utf8')).toBe('a');
    });
    await cleanupExpiredSessions(Date.now() + FILE_LIMITS.sessionTtlMs + 1000);
    await expect(fs.stat(input)).rejects.toMatchObject({ code: 'ENOENT' });
});
