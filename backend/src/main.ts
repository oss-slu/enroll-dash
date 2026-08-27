import { getGeocodeFromAddr } from "./census/getGeocodeFromAddr.ts";
import { HttpError } from "./getClient.ts";

async function main() {
    try {
        const result = await getGeocodeFromAddr('1 N Grand Blvd, Saint Louis, MO 63103');

        if (!result) {
            console.log('No matches');
        }

        console.log(result);
    } catch (err) {
        if (err instanceof HttpError) {
            console.error(`Census API error: ${err.status} ${err.statusText}`);
        } else {
            throw err;
        }
    }
}

main();