import { db, type Invite } from "../db";
import { HttpError, SeatLimitError } from "../errors";
import { sendInviteEmail } from "../mail";
import { seatUsage } from "./seats";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class InviteService {
    async create(teamId: string, email: string, invitedBy: string): Promise<Invite> {
        if (!EMAIL.test(email)) {
            throw new HttpError(422, "invalid_email", "That doesn't look like an email address.");
        }
        const seats = await seatUsage(teamId);
        if (seats.used >= seats.limit) {
            throw new SeatLimitError(seats.limit);
        }
        const invite = await db.invites.insert(teamId, email.toLowerCase(), invitedBy);
        await sendInviteEmail(invite);
        return invite;
    }
}
