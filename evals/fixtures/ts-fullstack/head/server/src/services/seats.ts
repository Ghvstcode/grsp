import { db } from "../db";
import { SEAT_LIMITS } from "../plans";

export interface SeatUsage {
    used: number;
    limit: number;
}

/** Members plus pending invites count against the plan's seat limit. */
export async function seatUsage(teamId: string): Promise<SeatUsage> {
    const team = await db.teams.get(teamId);
    const [members, pending] = await Promise.all([db.members.count(teamId), db.invites.countPending(teamId)]);
    return { used: members + pending, limit: SEAT_LIMITS[team.plan] };
}
