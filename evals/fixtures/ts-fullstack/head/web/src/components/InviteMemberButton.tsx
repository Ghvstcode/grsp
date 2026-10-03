import { useState } from "react";
import { ApiError, inviteMember } from "../lib/api";

const MESSAGES: Record<string, string> = {
    invalid_email: "That doesn't look like an email address.",
};

export function InviteMemberButton({ teamId, onInvited }: { teamId: string; onInvited: () => void }) {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    async function handleInvite() {
        setBusy(true);
        setError(undefined);
        try {
            await inviteMember(teamId, email);
            setEmail("");
            onInvited();
        } catch (err) {
            const code = err instanceof ApiError ? err.code : "";
            setError(MESSAGES[code] ?? "Something went wrong. Try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="invite">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            <button onClick={handleInvite} disabled={busy || email === ""}>
                Invite member
            </button>
            {error && <p role="alert">{error}</p>}
        </div>
    );
}
