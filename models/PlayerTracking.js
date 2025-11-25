import mongoose from "mongoose";

const PlayerTrackingSchema = new mongoose.Schema({
    username: String,
    kills: Number,
    deaths: Number,
    elo: Number,
    jadKills: Number,
    skotizoKills: Number,
    approved: String,
    dateTracked: { type: Date, default: Date.now }
});

export default mongoose.model("PlayerTracking", PlayerTrackingSchema);