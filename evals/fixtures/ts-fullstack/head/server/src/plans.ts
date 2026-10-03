export type Plan = "free" | "team" | "business";

export const SEAT_LIMITS: Record<Plan, number> = {
    free: 3,
    team: 25,
    business: 250,
};
