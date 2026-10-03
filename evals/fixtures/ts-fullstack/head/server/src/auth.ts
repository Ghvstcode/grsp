import type { NextFunction, Request, Response } from "express";
import { db } from "./db";

export async function requireUser(req: Request, res: Response, next: NextFunction) {
    const token = req.header("authorization")?.replace("Bearer ", "");
    const user = token ? await db.users.findByToken(token) : undefined;
    if (!user) {
        res.status(401).json({ error: "unauthenticated" });
        return;
    }
    res.locals.user = user;
    next();
}
