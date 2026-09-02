import { createApp } from './app';
import { VITE_ORIGIN } from './consts';

const PORT = 9876;

function main() {
    const app = createApp(VITE_ORIGIN);

    // listen for HTTP
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}

// ENTRYPOINT
main();
