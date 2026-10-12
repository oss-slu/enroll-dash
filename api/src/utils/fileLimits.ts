function limit(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`Invalid limit configuration: ${name}`);
    }
    return value;
}

export const FILE_LIMITS = {
    bytes: limit('DATASET_MAX_BYTES', 5 * 1024 * 1024),
    expandedBytes: limit('DATASET_MAX_EXPANDED_BYTES', 32 * 1024 * 1024),
    rows: limit('DATASET_MAX_ROWS', 2000),
    columns: limit('DATASET_MAX_COLUMNS', 100),
    cellChars: limit('DATASET_MAX_CELL_CHARS', 32767),
    uniqueGeocodes: limit('GEOCODE_MAX_UNIQUE', 100),
    concurrency: limit('GEOCODE_CONCURRENCY', 4),
    durationMs: limit('GEOCODE_DEADLINE_MS', 60000),
    sessionTtlMs: limit('UPLOAD_SESSION_TTL_MS', 24 * 60 * 60 * 1000),
};
