import type { Team } from '@secrets/shared';
import type { Db } from '../db/index.js';

interface TeamRow {
  id: number;
  org_id: number;
  name: string;
  member_ids: string;
}

const SELECT_TEAM = `
  SELECT t.*,
         (SELECT json_group_array(tm.user_id) FROM team_members tm WHERE tm.team_id = t.id) AS member_ids
  FROM teams t`;

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    memberIds: JSON.parse(row.member_ids) as number[],
  };
}

export function createTeam(db: Db, input: { orgId: number; name: string }): Team {
  const id = Number(
    db.prepare('INSERT INTO teams (org_id, name) VALUES (?, ?)').run(input.orgId, input.name).lastInsertRowid,
  );
  return getTeam(db, id)!;
}

export function getTeam(db: Db, id: number): Team | undefined {
  const row = db.prepare(`${SELECT_TEAM} WHERE t.id = ?`).get(id) as TeamRow | undefined;
  return row && toTeam(row);
}

export function listTeams(db: Db, orgId: number): Team[] {
  const rows = db.prepare(`${SELECT_TEAM} WHERE t.org_id = ? ORDER BY t.name`).all(orgId) as TeamRow[];
  return rows.map(toTeam);
}

export function addMember(db: Db, teamId: number, userId: number): void {
  db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)').run(teamId, userId);
}

/** Memberships cascade. Grants naming the team do not — the service deletes them first. */
export function deleteTeam(db: Db, teamId: number): void {
  db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
}
