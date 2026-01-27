import 'dotenv/config';
import VoiceTracking from "./models/voiceTracking.js";
import {Client, GatewayIntentBits} from "discord.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Bot logged in!'))
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
        // user left guild → skip
    }
}

console.log("✅ Usernames fixed");
process.exit(0);