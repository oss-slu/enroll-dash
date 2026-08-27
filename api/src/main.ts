import express from 'express';
// import { getGeocodeFromAddr } from "./census/getGeocodeFromAddr";
// import { HttpError } from "./getClient";

const PORT = 9876;

const app = express();
app.use(express.json());

app.listen(PORT, () => console.log(`API listening on port ${PORT}`));

// async function main() {
//     try {
//         const result = await getGeocodeFromAddr('1 N Grand Blvd, Saint Louis, MO 63103');

//         if (!result) {
//             console.log('No matches');
//         }

//         console.log(result);
//     } catch (err) {
//         if (err instanceof HttpError) {
//             console.error(`Census API error: ${err.status} ${err.statusText}`);
//         } else {
//             throw err;
//         }
//     }
// }

// main();