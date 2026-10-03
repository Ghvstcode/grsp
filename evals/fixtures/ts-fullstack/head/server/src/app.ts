import express from "express";
import { requireUser } from "./auth";
import { HttpError } from "./errors";
import { invitesRouter } from "./routes/invites";
import { membersRouter } from "./routes/members";

export const app = express();

app.use(express.json());
app.use(requireUser);
app.use("/api/teams/:teamId/invites", invitesRouter);
app.use("/api/teams/:teamId/members", membersRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
    }
    res.status(500).json({ error: "internal_error" });
});

app.listen(4000);
