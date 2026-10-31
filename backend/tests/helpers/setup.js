import { afterAll } from 'vitest';

import { db } from '@backend/lib/db';

// Each test file gets its own module graph, so close its pool when it finishes.
afterAll(async () => {
  await db.destroy();
});
