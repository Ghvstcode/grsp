import { useEffect, useState } from "react";
import { InviteMemberButton } from "../components/InviteMemberButton";
import { listMembers, type Member } from "../lib/api";

export function TeamSettings({ teamId }: { teamId: string }) {
    const [members, setMembers] = useState<Member[]>([]);

    async function refresh() {
        setMembers(await listMembers(teamId));
    }

    useEffect(() => {
        void refresh();
    }, [teamId]);

    return (
        <section>
            <h1>Team</h1>
            <ul>
                {members.map((m) => (
                    <li key={m.userId}>
                        {m.userId} · {m.role}
                    </li>
                ))}
            </ul>
            <InviteMemberButton teamId={teamId} onInvited={refresh} />
        </section>
    );
}
