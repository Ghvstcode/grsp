import { Router } from "express";
import { db } from "../db";

export const membersRouter = Router({ mergeParams: true });

// GET /api/teams/:teamId/members
membersRouter.get("/", async (req, res, next) => {
    try {
        const { teamId } = req.params as { teamId: string };
        res.json(await db.members.list(teamId));
    } catch (err) {
        next(err);
    }
});
