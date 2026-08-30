import { Router } from 'express';
import { ROUTES, type MeResponse, type TeamsResponse, type UsersResponse } from '@secrets/shared';
import type { Db } from '../../db/index.js';
import { getOrg } from '../../repo/orgs.js';
import { listTeams } from '../../repo/teams.js';
import { getUserById, listUsers } from '../../repo/users.js';
import { callerOf } from '../auth.js';

/** Who am I + the org directory (for sharing pickers). Session auth only, no admin needed. */
export function meRoutes(db: Db): Router {
  const r = Router();

  r.get(ROUTES.me, (req, res) => {
    const caller = callerOf(req);
    const body: MeResponse = {
      user: getUserById(db, caller.id)!,
      org: getOrg(db, caller.orgId)!,
      teams: listTeams(db, caller.orgId).filter((t) => caller.teamIds.includes(t.id)),
    };
    res.json(body);
  });

  r.get(ROUTES.users, (req, res) => {
    const body: UsersResponse = { users: listUsers(db, callerOf(req).orgId) };
    res.json(body);
  });

  r.get(ROUTES.teams, (req, res) => {
    const body: TeamsResponse = { teams: listTeams(db, callerOf(req).orgId) };
    res.json(body);
  });

  return r;
}
