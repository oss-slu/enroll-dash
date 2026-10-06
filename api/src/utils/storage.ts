import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileError } from '../errs/file';
import { FILE_LIMITS } from './fileLimits';

const active = new Map<string, number>();
const deleting = new Set<string>();
const baseDir = () =>
    path.resolve(process.env.UPLOAD_TEMP_DIR ?? '/tmp/enroll-dash');

export function validateSessionId(sessionId: string): void {
    if (
        typeof sessionId !== 'string' ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(sessionId)
    ) {
        throw new FileError(400, 'INVALID_SESSION', 'sessionId must be a UUID');
    }
}

export function validateFilename(filename: string): void {
    if (
        typeof filename !== 'string' ||
        !filename ||
        filename.length > 200 ||
        filename === '.' ||
        filename === '..' ||
        /[\\/]/u.test(filename) ||
        [...filename].some(
            (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
    ) {
        throw new FileError(
            400,
            'INVALID_FILENAME',
            'filename must be a safe leaf name',
        );
    }
}

async function sessionDir(sessionId: string, create = false): Promise<string> {
    validateSessionId(sessionId);
    const root = baseDir();
    if (create) await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const canonicalRoot = await fs.realpath(root);
    const dir = path.resolve(canonicalRoot, sessionId);
    // Check containment before any filesystem operation on the requested session.
    if (!dir.startsWith(path.join(canonicalRoot, path.sep))) {
        throw new FileError(400, 'INVALID_PATH', 'Invalid session directory');
    }
    if (create) await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(dir);
    if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        (await fs.realpath(dir)) !== dir
    ) {
        throw new FileError(400, 'INVALID_PATH', 'Invalid session directory');
    }
    return dir;
}

function translateMissing(err: unknown): never {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new FileError(
            404,
            'FILE_NOT_FOUND',
            'Session file does not exist',
        );
    }
    throw err;
}

export async function withSession<T>(
    sessionId: string,
    work: () => Promise<T>,
): Promise<T> {
    validateSessionId(sessionId);
    const key = path.join(baseDir(), sessionId);
    if (deleting.has(key))
        throw new FileError(409, 'SESSION_BUSY', 'Session is being deleted');
    active.set(key, (active.get(key) ?? 0) + 1);
    try {
        return await work();
    } finally {
        const count = active.get(key)! - 1;
        if (count) active.set(key, count);
        else active.delete(key);
    }
}

export async function resolveSessionFile(
    sessionId: string,
    inputPath: string,
): Promise<string> {
    validateSessionId(sessionId);
    if (
        typeof inputPath !== 'string' ||
        !path.isAbsolute(inputPath) ||
        path.resolve(inputPath) !== inputPath
    ) {
        throw new FileError(
            400,
            'INVALID_PATH',
            'path must identify an uploaded session file',
        );
    }
    try {
        const dir = await sessionDir(sessionId);
        validateFilename(path.basename(inputPath));
        if (path.dirname(inputPath) !== dir)
            throw new FileError(
                400,
                'INVALID_PATH',
                'path must belong to the supplied session',
            );
        const stat = await fs.lstat(inputPath);
        if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            (await fs.realpath(inputPath)) !== inputPath
        ) {
            throw new FileError(400, 'INVALID_PATH', 'Invalid session file');
        }
        return inputPath;
    } catch (err) {
        return translateMissing(err);
    }
}

export async function readSessionFile(
    sessionId: string,
    inputPath: string,
): Promise<Buffer> {
    const safePath = await resolveSessionFile(sessionId, inputPath);
    // Refuse leaf symlinks even if a file was replaced after resolution.
    const handle = await fs.open(
        safePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
        const stat = await handle.stat();
        if (!stat.isFile())
            throw new FileError(400, 'INVALID_PATH', 'Invalid session file');
        if (stat.size > FILE_LIMITS.bytes)
            throw new FileError(
                413,
                'FILE_TOO_LARGE',
                'Dataset exceeds the file byte limit',
            );
        return await handle.readFile();
    } finally {
        await handle.close();
    }
}

export const saveSessionFile = async (
    sessionId: string,
    filename: string,
    buffer: Buffer,
    signal?: AbortSignal,
): Promise<string> =>
    withSession(sessionId, async () => {
        validateFilename(filename);
        const dir = await sessionDir(sessionId, true);
        const outputPath = path.join(dir, filename);
        const pending = path.join(dir, `.pending-${randomUUID()}`);
        try {
            signal?.throwIfAborted();
            await fs.writeFile(pending, buffer, { flag: 'wx', mode: 0o600 });
            signal?.throwIfAborted();
            await fs.utimes(dir, new Date(), new Date());
            signal?.throwIfAborted();
            // Linking publishes a complete file atomically and fails if the name exists.
            await fs.link(pending, outputPath);
            if (signal?.aborted) {
                await fs.rm(outputPath, { force: true });
                signal.throwIfAborted();
            }
            return outputPath;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'EEXIST')
                throw new FileError(
                    409,
                    'FILE_EXISTS',
                    'Output filename already exists',
                );
            throw err;
        } finally {
            await fs.rm(pending, { force: true }).catch(() => undefined);
        }
    });

export const deleteSessionDir = async (sessionId: string): Promise<void> => {
    validateSessionId(sessionId);
    const key = path.join(baseDir(), sessionId);
    if (active.has(key) || deleting.has(key))
        throw new FileError(
            409,
            'SESSION_BUSY',
            'Session has an active file operation',
        );
    deleting.add(key);
    try {
        await fs.rm(await sessionDir(sessionId), {
            recursive: true,
            force: true,
        });
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    } finally {
        deleting.delete(key);
    }
};

// Call periodically; active operations keep their session until they finish.
export async function cleanupExpiredSessions(now = Date.now()): Promise<void> {
    let entries;
    try {
        entries = await fs.readdir(baseDir());
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
    }
    for (const id of entries) {
        try {
            validateSessionId(id);
            const dir = await sessionDir(id);
            if (now - (await fs.stat(dir)).mtimeMs > FILE_LIMITS.sessionTtlMs)
                await deleteSessionDir(id);
        } catch (err) {
            if (
                err instanceof FileError ||
                (err as NodeJS.ErrnoException).code === 'ENOENT'
            )
                continue;
            throw err;
        }
    }
}
