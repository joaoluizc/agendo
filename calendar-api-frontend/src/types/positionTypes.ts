export type Position = {
    positionId: string
    name: string
    type: "live channel" | "tickets" | "meeting" | "break" | "development" | "training"
    color: string
    sync: boolean
}

export type PositionSync = {
    positionId: string
    sync: boolean
}