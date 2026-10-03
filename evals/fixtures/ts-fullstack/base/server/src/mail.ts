import type { Invite } from "./db";

export async function sendInviteEmail(invite: Invite): Promise<void> {
    await fetch(`${process.env.MAIL_API_URL}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            to: invite.email,
            template: "team-invite",
            data: { inviteId: invite.id, teamId: invite.teamId },
        }),
    });
}
