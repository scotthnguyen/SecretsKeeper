import { Router } from 'express';
import {
  CreateTeamRequestSchema,
  CreateUserRequestSchema,
  ROUTES,
  SetUserTeamsRequestSchema,
  type DeleteUserResponse,
  type OkResponse,
  type TeamResponse,
  type UserResponse,
} from '@secrets/shared';
import type { Db } from '../../db/index.js';
import * as admin from '../../services/admin.js';
import { callerOf, requireAdmin } from '../auth.js';
import { idParam, parseBody } from '../validate.js';

export function adminRoutes(db: Db): Router {
  const r = Router();
  r.use(requireAdmin);

  r.post(ROUTES.admin.users, (req, res) => {
    const input = parseBody(CreateUserRequestSchema, req.body);
    const body: UserResponse = { user: admin.createUser(db, callerOf(req), input) };
    res.status(201).json(body);
  });

  r.delete(`${ROUTES.admin.users}/:id`, (req, res) => {
    const { transferredSecrets } = admin.deleteUser(db, callerOf(req), idParam(req));
    const body: DeleteUserResponse = { ok: true, transferredSecrets };
    res.json(body);
  });

  r.post(`${ROUTES.admin.users}/:id/promote`, (req, res) => {
    const body: UserResponse = { user: admin.promoteUser(db, callerOf(req), idParam(req)) };
    res.json(body);
  });

  r.put(`${ROUTES.admin.users}/:id/teams`, (req, res) => {
    const { teamIds } = parseBody(SetUserTeamsRequestSchema, req.body);
    const body: UserResponse = { user: admin.setUserTeams(db, callerOf(req), idParam(req), teamIds) };
    res.json(body);
  });

  r.post(ROUTES.admin.teams, (req, res) => {
    const { name } = parseBody(CreateTeamRequestSchema, req.body);
    const body: TeamResponse = { team: admin.createTeam(db, callerOf(req), name) };
    res.status(201).json(body);
  });

  r.delete(`${ROUTES.admin.teams}/:id`, (req, res) => {
    admin.deleteTeam(db, callerOf(req), idParam(req));
    const body: OkResponse = { ok: true };
    res.json(body);
  });

  return r;
}
