import mongoose from 'mongoose';

const ClanMemberSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    rankId: Number,
    rankName: String,
    rankedAt: Number,
    lastSeen: String,
    kills: { type: Number, default: 0 },
    deaths: { type: Number, default: 0 },
    donatorRank: Number,
    elo: Number,
    playerRank: Number,
    npcKills: { type: mongoose.Schema.Types.Mixed, default: {} },
    skills: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now }
});

export const ClanMember = mongoose.model('ClanMember', ClanMemberSchema);