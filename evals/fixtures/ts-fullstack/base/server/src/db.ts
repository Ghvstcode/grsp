import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Team {
    id: string;
    plan: string;
}

export interface Invite {
    id: string;
    teamId: string;
    email: string;
    invitedBy: string;
}

export const db = {
    users: {
        async findByToken(token: string): Promise<{ id: string } | undefined> {
            const { rows } = await pool.query("select id from users where api_token = $1", [token]);
            return rows[0];
        },
    },
    teams: {
        async get(teamId: string): Promise<Team> {
            const { rows } = await pool.query("select id, plan from teams where id = $1", [teamId]);
            return rows[0];
        },
    },
    members: {
        async list(teamId: string): Promise<{ userId: string; role: string }[]> {
            const { rows } = await pool.query(
                'select user_id as "userId", role from members where team_id = $1 order by joined_at',
                [teamId],
            );
            return rows;
        },
    },
    invites: {
        async insert(teamId: string, email: string, invitedBy: string): Promise<Invite> {
            const { rows } = await pool.query(
                'insert into invites (team_id, email, invited_by) values ($1, $2, $3) returning id, team_id as "teamId", email, invited_by as "invitedBy"',
                [teamId, email, invitedBy],
            );
            return rows[0];
        },
    },
};
