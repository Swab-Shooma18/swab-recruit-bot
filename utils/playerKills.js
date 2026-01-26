// utils/playerKills.js
import mongoose from 'mongoose';


const playerKillsSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    weeklyKills: { type: Number, default: 0 },
    lastTotalKills: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

export const PlayerKills = mongoose.model('PlayerKills', playerKillsSchema);