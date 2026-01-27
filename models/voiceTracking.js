import mongoose from "mongoose";

const VoiceTrackingSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    username: { type: String },
    // actieve sessie
    joinedAt: { type: Number, default: null },

    // per week (ISO week)
    weekly: {
        type: Map,
        of: Number, // milliseconds
        default: {}
    }
});

VoiceTrackingSchema.index({ userId: 1, guildId: 1 }, { unique: true });
export default mongoose.model("VoiceTracking", VoiceTrackingSchema);