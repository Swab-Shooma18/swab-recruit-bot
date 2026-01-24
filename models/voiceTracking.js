import mongoose from "mongoose";

const VoiceTrackingSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },

    // actieve sessie
    joinedAt: { type: Number, default: null },

    // per week (ISO week)
    weekly: {
        type: Map,
        of: Number, // milliseconds
        default: {}
    }
});

export default mongoose.model("VoiceTracking", VoiceTrackingSchema);