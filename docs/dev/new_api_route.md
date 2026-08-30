# Creating a new API route
1. Create the express.Router in a new file in *api/src/routes*
    - Only one route per file
    - Each should roughly follow this pattern
    ```ts
    import { Router } from 'express';
    const router = Router();
    router.get('routeName', () => { ... });
    ...
    export default router;
    ```
1. Import the router in *api/src/main.ts* and add it to the ***ROUTES*** array
```ts
// BEFORE:
import health from './routes/health';
const ROUTES = [health];

// AFTER:
import health from './routes/health';
import newRoute from './routes/newRoute';
const ROUTES = [health, newRoute];
```