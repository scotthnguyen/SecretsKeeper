// Phase 0 placeholder: proves the toolchain. Replaced in Phase 2.
import express from 'express';
import { ROUTES } from '@secrets/shared';

const app = express();
app.get(ROUTES.health, (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
