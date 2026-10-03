import { db, type Invite } from "../db";
import { HttpError } from "../errors";
import { sendInviteEmail } from "../mail";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class InviteService {
    async create(teamId: string, email: string, invitedBy: string): Promise<Invite> {
        if (!EMAIL.test(email)) {
            throw new HttpError(422, "invalid_email", "That doesn't look like an email address.");
        }
        const invite = await db.invites.insert(teamId, email.toLowerCase(), invitedBy);
        await sendInviteEmail(invite);
        return invite;
    }
}
