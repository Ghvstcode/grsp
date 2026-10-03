import { Router } from "express";
import { InviteService } from "../services/invites";

export const invitesRouter = Router({ mergeParams: true });

const service = new InviteService();

// POST /api/teams/:teamId/invites
invitesRouter.post("/", async (req, res, next) => {
    try {
        const { teamId } = req.params as { teamId: string };
        const invite = await service.create(teamId, String(req.body.email ?? ""), res.locals.user.id);
        res.status(201).json(invite);
    } catch (err) {
        next(err);
    }
});
