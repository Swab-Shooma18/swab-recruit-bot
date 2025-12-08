import 'dotenv/config';
import express from 'express';
import {
    InteractionResponseType,
    InteractionType,
    verifyKeyMiddleware,
} from 'discord-interactions';
import { Client, GatewayIntentBits } from 'discord.js';
import got from 'got';
import PlayerTracking from "./models/PlayerTracking.js";
import {connectDB} from "./utils/database.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// Discord client
// ========================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ========================
// Cache voor /player
// ========================
const playerCache = new Map(); // key = username, value = { data, timestamp }
const CACHE_TTL = 30 * 1000; // 30 seconden

// Donator rank mapping
const DONATOR_RANKS = {
    0: 'No',
    1: 'Normal',
    2: 'Super',
    3: 'Extreme',
    4: 'Legendary',
    5: 'Royal'
};

// ========================
// Interaction endpoint
// ========================
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
    const { type, data } = req.body;

    // Ping
    if (type === InteractionType.PING) return res.send({ type: InteractionResponseType.PONG });
    if (type !== InteractionType.APPLICATION_COMMAND) return res.status(400).json({ error: 'Unknown interaction type' });

    const { name, options } = data;

    if (name.toLowerCase() === 'add') {
        const username = options[0].value;

        try {
            // Check if already tracked
            const exists = await PlayerTracking.findOne({
                username: { $regex: `^${username}$`, $options: 'i' }
            });

            if (exists) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `⚠️ **${username}** already added!` }
                });
            }

            // Fetch live stats
            const kills = await getKillCount(username);
            const deaths = await getDeathCount(username);
            const jadAndSkotizo = await getJadAndSkotizo(username);

            if (!kills || !deaths) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `❌ USERNAME (**${username}**) NOT FOUND ON THE ROAT PKZ HIGHSCORES!` }
                });
            }

            const today = new Date().toISOString().split("T")[0];

            const stats = {
                username,
                kills: kills.kills,
                deaths,
                elo: kills.elo,
                jadKills: jadAndSkotizo.jad,
                skotizoKills: jadAndSkotizo.skotizo,
                approver: "Manual command",
                date: today
            };

            await PlayerTracking.create(stats);

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `
\`\`\`
✅ **${username} added to the database!(Started tracking from this day: (*${today}*)**
\`\`\`
📊 **Stats today:**  
🔥 Kills: **${kills.kills}**  
💀 Deaths: **${deaths}**  
🏆 Elo: **${kills.elo}**  
🌋 Jad kills: **${jadAndSkotizo.jad}**  
👹 Skotizo kills: **${jadAndSkotizo.skotizo}**
                `
                }
            });

        } catch (err) {
            console.error("ADD COMMAND ERROR:", err);

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `❌ ERROR WHILE SAVING PLEASE WAIT 2 MINUTES.` }
            });
        }
    }
    if (name.toLowerCase() !== 'player') return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `❌ Unknown command: ${name}` }
    });

    const username = options[0]?.value;
    if (!username) return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Please provide a username.' }
    });

    // ========================
    // Check cache
    // ========================
    const cached = playerCache.get(username);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: cached.data
        });
    }

    // ========================
    // Fetch player data with got
    // ========================
    let playerData;
    try {
        const resAPI = await got(`https://api.roatpkz.ps/api/v1/player/${encodeURIComponent(username)}`, {
            headers: { 'x-api-key': process.env.ROAT_API_KEY },
            timeout: { request: 5000 },
            responseType: 'json'
        });
        playerData = resAPI.body;

        if (!playerData || !playerData.username) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `❌ Player **${username}** not found!` }
            });
        }
    } catch (err) {
        console.error('Error fetching player:', err.message);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `❌ Could not fetch player **${username}**. Probeer later opnieuw.` }
        });
    }

    // ========================
    // Prepare embed
    // ========================
    const kd = playerData.deaths === 0 ? playerData.kills : (playerData.kills / playerData.deaths).toFixed(2);

    const embed = {
        type: 'rich',
        title: `📄${playerData.display_name || playerData.username}`,
        color: 0xffcc00,
        fields: [
            { name: '⚔️ Kills', value: `${playerData.kills}`, inline: true },
            { name: '💀 Deaths', value: `${playerData.deaths}`, inline: true },
            { name: '📊 K/D', value: `${kd}`, inline: true },
            { name: '🔥 ELO', value: `${playerData.elo}`, inline: true },
            { name: '🏰 Clan Rank', value: playerData.clan_info?.rankName || 'None', inline: true },
            { name: '💎 Donator', value: DONATOR_RANKS[playerData.donator_rank] || 'None', inline: true },
            { name: '🌋 Jad', value: playerData.jad.count || '0', inline: true },
            { name: '👹 Skotizo', value: playerData.skotizo.count || '0', inline: true },
            { name: '🕒 Last Seen', value: playerData.last_seen || 'Unknown', inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roat Pkz API • Clan: Swab'}
    };

    const response = { embeds: [embed] };

    // ========================
    // Cache the response
    // ========================
    playerCache.set(username, { data: response, timestamp: Date.now() });

    // ========================
    // Send response
    // ========================
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: response
    });
});

export default function registerEventListeners(client) {

    client.on('messageCreate', async (message) => {
        if (message.channelId !== process.env.ACCEPT_CHANNEL_ID) return;
        if (!message.author.bot) return;
        if (!message.embeds?.length) return;

        const embed = message.embeds[0];
        const title = embed.title;
        if (!title || !title.includes('Application Submitted')) return;

        const statsField = embed.fields.find(f => f.name === "Submission stats");
        if (!statsField) return;

        // --- EXTRACT DISCORD USER ID ---
        const idMatch = statsField.value.match(/User: <@(\d+)>/);
        if (!idMatch) return;
        const discordUserId = idMatch[1];

        try {
            const guild = await client.guilds.fetch(message.guildId);
            const member = await guild.members.fetch(discordUserId);
            const discordUsername = member.displayName;

            // --- APPROVER ---
            const approverMatch = message.content.match(/by\s+@?([^\s]+)/);
            const approverUsername = approverMatch ? approverMatch[1] : "unknown";

            const dateToday = new Date().toISOString().split("T")[0];

            // --- GET STATS NOW THAT WE KNOW THE USERNAME ---
            const kills = await getKillCount(discordUsername);
            const deaths = await getDeathCount(discordUsername);
            const jadAndSkotizo = await getJadAndSkotizo(discordUsername);

            const killsValue = Number(kills.kills);
            const deathsValue = Number(deaths);

            let line = killsValue < deathsValue ? "❌ NEGATIVE KDR" : "✅ POSITIVE KDR";

            // --- BUILD OBJECT FOR DATABASE ---
            const stats = {
                username: discordUsername,
                kills: kills.kills,
                deaths: deaths,
                elo: kills.elo,
                jadKills: jadAndSkotizo.jad,
                skotizoKills: jadAndSkotizo.skotizo,
                approver: approverUsername,
                date: dateToday
            };

            await PlayerTracking.create(stats);
            console.log("💾 Saved tracking to DB:", stats);

            // --- SEND MESSAGE TO RECRUIT CHANNEL ---
            const recruitChannel = await client.channels.fetch(process.env.RECRUIT_CHANNEL_ID);
            if (!recruitChannel) return console.log("❌ Recruit channel not found");

            recruitChannel.send(`
\`\`\`
Found ${discordUsername} on the Roat pkz highscores! ✅
\`\`\`
🔍 **First** tracking of **${discordUsername}** on **${dateToday}**
🔥 has **${kills.kills}** kills and **${deaths}** deaths | Elo: **${kills.elo}** (*${line}*)
ℹ️ Easy **lookup** **#first${discordUsername}**
📅 *TRACKED/ACCEPTED* BY ${approverUsername}
      `);

        } catch (err) {
            console.error("Error processing accepted application:", err);
        }
    });
}

// ========================
// Start bot & server
// ========================

await connectDB();
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Bot logged in!'))
    .catch(err => console.error('Login failed:', err));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
