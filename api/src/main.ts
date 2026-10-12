import { createApp } from './app';
import { VITE_ORIGIN } from './consts';
import { closeDB, connectDB } from './db/connect';
import { cleanupExpiredSessions } from './utils/storage';

const PORT = 9876;

async function main() {
    const app = createApp(VITE_ORIGIN);
    const cleanup = () => {
        void cleanupExpiredSessions().catch(() =>
            console.error('Session expiration cleanup failed'),
        );
    };
    cleanup();
    setInterval(cleanup, 60 * 60 * 1000).unref();

    await connectDB();
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
    process.on('SIGTERM', () => void closeDB());
}

// ENTRYPOINT
await main();
