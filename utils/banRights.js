import mongoose from "mongoose";

const BanRightsSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    inGameName: { type: String, required: true }
});

export default mongoose.model("BanRights", BanRightsSchema);