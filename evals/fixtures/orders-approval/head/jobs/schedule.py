SCHEDULE = []


def nightly(hour):
    """Registers a job class to run once a night at the given hour (UTC)."""

    def register(job_cls):
        SCHEDULE.append({"cron": f"0 {hour} * * *", "job": job_cls})
        return job_cls

    return register


def run_due(now):
    for entry in SCHEDULE:
        if entry["cron"] == f"0 {now.hour} * * *" and now.minute == 0:
            entry["job"]().run()
