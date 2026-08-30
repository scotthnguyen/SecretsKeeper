import { Router } from 'express';
import {
  CreateSecretRequestSchema,
  ROUTES,
  SetGrantsRequestSchema,
  UpdateSecretRequestSchema,
  type OkResponse,
  type SecretResponse,
  type SecretsListResponse,
} from '@secrets/shared';
import type { Db } from '../../db/index.js';
import * as secrets from '../../services/secrets.js';
import { callerOf } from '../auth.js';
import { notFound } from '../errors.js';
import { idParam, parseBody } from '../validate.js';

export function secretRoutes(db: Db): Router {
  const r = Router();

  r.get(ROUTES.secrets, (req, res) => {
    const body: SecretsListResponse = { secrets: secrets.listVisibleSecrets(db, callerOf(req)) };
    res.json(body);
  });

  r.post(ROUTES.secrets, (req, res) => {
    const input = parseBody(CreateSecretRequestSchema, req.body);
    const body: SecretResponse = { secret: secrets.createSecret(db, callerOf(req), input) };
    res.status(201).json(body);
  });

  r.get(`${ROUTES.secrets}/:id`, (req, res) => {
    const secret = secrets.getVisibleSecret(db, callerOf(req), idParam(req));
    if (!secret) throw notFound('No such secret');
    const body: SecretResponse = { secret };
    res.json(body);
  });

  r.put(`${ROUTES.secrets}/:id`, (req, res) => {
    const { value } = parseBody(UpdateSecretRequestSchema, req.body);
    const body: SecretResponse = { secret: secrets.updateSecret(db, callerOf(req), idParam(req), value) };
    res.json(body);
  });

  r.put(`${ROUTES.secrets}/:id/grants`, (req, res) => {
    const { grants } = parseBody(SetGrantsRequestSchema, req.body);
    const body: SecretResponse = { secret: secrets.setSecretGrants(db, callerOf(req), idParam(req), grants) };
    res.json(body);
  });

  r.delete(`${ROUTES.secrets}/:id`, (req, res) => {
    secrets.deleteSecret(db, callerOf(req), idParam(req));
    const body: OkResponse = { ok: true };
    res.json(body);
  });

  return r;
}
