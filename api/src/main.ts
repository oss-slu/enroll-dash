import { createApp } from './app';
import { VITE_ORIGIN } from './consts';
import { cleanupExpiredSessions } from './utils/storage';

const PORT = 9876;

function main() {
    const app = createApp(VITE_ORIGIN);
    const cleanup = () => {
        void cleanupExpiredSessions().catch(() =>
            console.error('Session expiration cleanup failed'),
        );
    };
    cleanup();
    setInterval(cleanup, 60 * 60 * 1000).unref();

    // listen for HTTP
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}

// ENTRYPOINT
main();
