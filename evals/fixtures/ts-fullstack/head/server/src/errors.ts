export class HttpError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
    ) {
        super(message);
    }
}

export class SeatLimitError extends HttpError {
    constructor(limit: number) {
        super(409, "seat_limit_reached", `This team's plan allows ${limit} seats.`);
    }
}
