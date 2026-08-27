import express from 'express';
import health from './routes/health';
import geocode from './routes/geocode';

const PORT = 9876;
const ROUTES = [health, geocode];

function main() {
    const app = express();
    app.use(express.json());

    // register routes
    ROUTES.forEach(r => app.use(r));

    // listen for HTTP
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}

// ENTRYPOINT
main();