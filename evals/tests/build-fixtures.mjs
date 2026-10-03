import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
    buildFixture,
    buildFixtures,
    listFixtures,
} from "../build-fixtures.mjs";

const reposDir = fs.mkdtempSync(path.join(os.tmpdir(), "grsp-eval-fixtures-"));
after(() => fs.rmSync(reposDir, { recursive: true, force: true }));

const git = (cwd, ...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

test("every fixture becomes a repo with main at base and pr at head", () => {
    const built = buildFixtures([], { reposDir });
    assert.deepEqual(
        built.map((b) => b.name),
        listFixtures(),
    );
    for (const repo of built) {
        assert.equal(
            git(repo.repoDir, "rev-parse", "--abbrev-ref", "HEAD"),
            "main",
        );
        assert.equal(git(repo.repoDir, "rev-list", "--count", "pr"), "2");
        assert.equal(
            git(repo.repoDir, "merge-base", "main", "pr"),
            repo.baseSha,
        );
        assert.equal(git(repo.repoDir, "status", "--porcelain"), "");
        assert.ok(repo.changedFiles.length > 0);
    }
});

test("builds are deterministic", () => {
    const first = buildFixture("orders-approval", { reposDir });
    const second = buildFixture("orders-approval", { reposDir });
    assert.equal(first.baseSha, second.baseSha);
    assert.equal(first.headSha, second.headSha);
});

test("orders-approval: the diff is the approval PR and leaves the bulk import alone", () => {
    const { repoDir } = buildFixture("orders-approval", { reposDir });
    const changed = git(repoDir, "diff", "--name-status", "main..pr").split(
        "\n",
    );
    assert.ok(changed.includes("A\torders/policies.py"));
    assert.ok(changed.includes("A\tapprovals/service.py"));
    assert.ok(changed.includes("A\tapi/views/approvals.py"));
    assert.ok(changed.includes("M\torders/services.py"));
    assert.ok(
        !changed.some((line) => line.endsWith("jobs/bulk_import.py")),
        "the bulk import must be untouched",
    );

    const services = git(
        repoDir,
        "diff",
        "main..pr",
        "--",
        "orders/services.py",
    );
    assert.match(services, /^\+\s+decision = ApprovalPolicy\.check\(order\)$/m);
    assert.match(services, /^-\s+order\.status = Status\.CONFIRMED$/m);

    // insert_many exists on both sides, unchanged, and still bulk_creates CONFIRMED orders.
    const repository = git(
        repoDir,
        "diff",
        "main..pr",
        "--",
        "orders/repository.py",
    );
    assert.doesNotMatch(repository, /^[+-].*(insert_many|bulk_create)/m);
    const head = git(repoDir, "show", "pr:orders/repository.py");
    assert.match(
        head,
        /o\.status = Status\.CONFIRMED\n\s+return Order\.objects\.bulk_create\(orders\)/,
    );
    assert.match(
        git(repoDir, "show", "pr:orders/policies.py"),
        /THRESHOLD = Money\("10000\.00", "EUR"\)/,
    );
    assert.match(
        git(repoDir, "show", "pr:orders/policies.py"),
        /if order\.total > THRESHOLD:/,
    );
});

test("ts-fullstack: only the server changes; the button that calls it does not", () => {
    const { repoDir, changedFiles } = buildFixture("ts-fullstack", {
        reposDir,
    });
    assert.ok(
        changedFiles.every((line) => line.split("\t")[1].startsWith("server/")),
    );
    assert.match(
        git(repoDir, "show", "pr:web/src/components/InviteMemberButton.tsx"),
        /inviteMember\(teamId, email\)/,
    );
    assert.match(
        git(repoDir, "show", "pr:server/src/services/invites.ts"),
        /throw new SeatLimitError/,
    );
});

test("go-service: the handler, service and store change together", () => {
    const { changedFiles } = buildFixture("go-service", { reposDir });
    const files = changedFiles.map((line) => line.split("\t")[1]);
    for (const file of [
        "internal/httpapi/handlers.go",
        "internal/transfers/service.go",
        "internal/store/store.go",
        "migrations/0002_transfer_idempotency_key.sql",
    ]) {
        assert.ok(files.includes(file), file);
    }
});

test("config-only: nothing but YAML and SQL changes", () => {
    const { changedFiles } = buildFixture("config-only", { reposDir });
    assert.deepEqual(changedFiles, [
        "A\tdb/migrations/0007_shipments_status_created_at_idx.sql",
        "M\tdeploy/values.yaml",
    ]);
});

test("an unknown fixture is an error", () => {
    assert.throws(
        () => buildFixtures(["nope"], { reposDir }),
        /Unknown fixture/,
    );
});
