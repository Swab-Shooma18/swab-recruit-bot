import 'dotenv/config';
import VoiceTracking from "./models/voiceTracking.js";
import {Client, GatewayIntentBits} from "discord.js";
import mongoose from "mongoose";

try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
} catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
}


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('client logged in!'))
    .catch(err => console.error('Login failed:', err));

// wacht tot bot ready is
await new Promise(resolve => client.once("ready", resolve));

const guild = await client.guilds.fetch(process.env.GUILD_ID);
const docs = await VoiceTracking.find({ guildId: process.env.GUILD_ID });

for (const doc of docs) {
    try {
        const member = await guild.members.fetch(doc.userId);

        await VoiceTracking.updateOne(
            { _id: doc._id },
            { username: member.displayName }
        );
    } catch {
        console.log(`Skipped user ${doc.userId}: ${err.message}`);
    }
}

console.log("✅ Usernames fixed");
process.exit(0);