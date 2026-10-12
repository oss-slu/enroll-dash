# Creating a new API route

Create an Express router in `api/src/routes`, following nearby routes:

```ts
import { Router } from 'express';
const router = Router();
router.get('/new-route', (_req, res) => { res.json({ success: true }); });
export default router;
```

Import it in `api/src/app.ts` and add it to `ROUTES`:

```ts
import newRoute from './routes/newRoute';
// Add alongside existing entries:
{ router: newRoute, route: '/new-route' }
```

`createApp` mounts each router, which defines its full path. The `route` property
is metadata used by route-mounting tests. `api/src/main.ts` starts the server;
it is not the route registry. Test endpoints through `createApp` with Supertest,
and put reusable processing logic in utilities.
