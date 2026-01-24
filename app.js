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
import {getKillCount} from "./utils/getKillCount.js";
import {getDeathCount} from "./utils/getDeathCount.js";
import {getJadAndSkotizo} from "./utils/getJadAndSkotizo.js";
import VoiceTracking from "./models/voiceTracking.js";
import { getWeekKey } from "./utils/getWeekKey.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// Discord client
// ========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ========================
// Cache voor /player
// ========================
const playerCache = new Map(); // key = username, value = { data, timestamp }
const CACHE_TTL = 30 * 1000; // 30 seconden
let lastBans = []; // cache


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

    if (name === "check") {
        const username = options[0].value;

        try {
            const player = await PlayerTracking.findOne({
                username: { $regex: `^${username}$`, $options: 'i' }
            });

            if (!player) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `❌ NO TRACKING FOUND FOR **${username}**` }
                });
            }

            // Live stats via highscores
            const liveKills = await getKillCount(username);
            const liveDeaths = await getDeathCount(username);
            const liveJadAndSkotizo = await getJadAndSkotizo(username);

            const liveKillCount = Number(liveKills.kills);
            const liveDeathCount = Number(liveDeaths);

            // Jad / Skotizo values
            const liveJad = Number(liveJadAndSkotizo.jad || 0);
            const liveSkotizo = Number(liveJadAndSkotizo.skotizo || 0);

            // Old tracked stats
            const oldKills = Number(player.kills);
            const oldDeaths = Number(player.deaths);
            const oldJad = Number(player.jad || 0);
            const oldSkotizo = Number(player.skotizo || 0);

            // Differences
            const diffKills = liveKillCount - oldKills;
            const diffDeaths = liveDeathCount - oldDeaths;
            const diffJad = liveJad - oldJad;
            const diffSkotizo = liveSkotizo - oldSkotizo;

            // Format + or - for display
            const diffKillsStr = diffKills >= 0 ? `+${diffKills}` : `${diffKills}`;
            const diffDeathsStr = diffDeaths >= 0 ? `+${diffDeaths}` : `${diffDeaths}`;
            const diffJadStr = diffJad >= 0 ? `+${diffJad}` : `${diffJad}`;
            const diffSkotizoStr = diffSkotizo >= 0 ? `+${diffSkotizo}` : `${diffSkotizo}`;

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `
📊 **Progress check for ${username}**

🔥 **Kills:**  
• First tracked: **${oldKills}**  
• Now: **${liveKillCount}**  
📈 Change: **${diffKillsStr}**

💀 **Deaths:**  
• First tracked: **${oldDeaths}**  
• Now: **${liveDeathCount}**  
📉 Change: **${diffDeathsStr}**

🌋 **Jad kills:**  
• First tracked: **${oldJad}**  
• Now: **${liveJad}**  
📈 Change: **${diffJadStr}**

👹 **Skotizo kills:**  
• First tracked: **${oldSkotizo}**  
• Now: **${liveSkotizo}**  
📈 Change: **${diffSkotizoStr}**

⏳ **Tracked since:** ${player.dateTracked}
                `
                }
            });

        } catch (err) {
            console.error("CHECK COMMAND ERROR:", err);

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `❌ Error while checking progress.` }
            });
        }
    }



    if (name === 'lookup') {
        const username = options[0].value;
        try {
            const kills = await getKillCount(username);
            const deaths = await getDeathCount(username);
            const killsValue = Number(kills.kills);
            const deathsValue = Number(deaths);
            let line = "";


            if (!kills || !deaths) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {content: `❌ Player not found! (**${username}**)`}
                });
            }

            if (killsValue < deathsValue) {
                line = "❌ NEGATIVE KDR";
            } else {
                line = "✅ POSITIVE KDR";
            }

            // Reageer eerst op het command
            res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {content: `🔍 **${username}** has **${kills.kills}** kills and **${deaths}** deaths | Elo: **${kills.elo}** (**${line}**)`}
            });

        } catch (err) {
            console.error(err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {content: `❌ REQUEST ERROR`}
            });
        }
    }

    if (name === "checkvoice") {
        const user = options[0].value;
        const weekKey = getWeekKey();


        const data = await VoiceTracking.findOne({
            userId: user,
            guildId: req.body.guild_id
        });


        if (!data) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: "❌ No voice activity found." }
            });
        }


        let ms = data.weekly.get(weekKey) || 0;

        if (data.joinedAt) {
            ms += Date.now() - data.joinedAt;
        }


        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;


        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                embeds: [{
                    color: 0x5865F2,
                    title: "🎧 Voice Activity (beta)",
                    description: `<@${user}> has spent **${hours}h ${remainingMinutes}m** in voice **this week**.`,
                    footer: { text: `Week: ${weekKey}` }
                }]
            }
        });
    }

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
            data: { content: `❌ Could not fetch player **${username}**. Try again later.` }
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
            { name: '🌋 Jad', value: playerData.jad?.count || '0', inline: true },
            { name: '👹 Skotizo', value: playerData.skotizo?.count || '0', inline: true },
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
    client.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            const IGNORED_VOICE_CHANNELS = [
                "1117364519702904873"
            ];
            const userId = newState.id;
            const guildId = newState.guild.id;

            const oldChannel = oldState.channelId;
            const newChannel = newState.channelId;


            if (IGNORED_VOICE_CHANNELS.includes(oldChannel) && IGNORED_VOICE_CHANNELS.includes(newChannel)) return;

            if (!oldChannel && newChannel && !IGNORED_VOICE_CHANNELS.includes(newChannel)) {
                await VoiceTracking.findOneAndUpdate(
                    { userId, guildId },
                    { joinedAt: Date.now() },
                    { upsert: true }
                );
            }

            if (oldChannel && !newChannel && !IGNORED_VOICE_CHANNELS.includes(oldChannel)) {
                const record = await VoiceTracking.findOne({ userId, guildId });
                if (record?.joinedAt) {
                    const timeSpent = Date.now() - record.joinedAt;

                    const weekKey = getWeekKey();
                    const current = record.weekly.get(weekKey) || 0;
                    record.weekly.set(weekKey, current + timeSpent);
                    record.joinedAt = null;
                    await record.save();
                }
            }


            if (oldChannel && newChannel && oldChannel !== newChannel) {
                if (!IGNORED_VOICE_CHANNELS.includes(oldChannel)) {
                    const record = await VoiceTracking.findOne({ userId, guildId });
                    if (record?.joinedAt) {
                        const timeSpent = Date.now() - record.joinedAt;
                        const weekKey = getWeekKey();
                        const current = record.weekly.get(weekKey) || 0;
                        record.weekly.set(weekKey, current + timeSpent);
                    }
                }


                if (!IGNORED_VOICE_CHANNELS.includes(newChannel)) {
                    await VoiceTracking.findOneAndUpdate(
                        { userId, guildId },
                        { joinedAt: Date.now() },
                        { upsert: true }
                    );
                }
            }


        } catch (err) {
            console.error("❌ Voice tracking error:", err);
        }
    });

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
registerEventListeners(client);

async function checkClanBans() {
    try {
        const res = await got("https://api.roatpkz.ps/api/v1/clan/bans", {
            headers: { "x-api-key": process.env.ROAT_API_KEY },
            responseType: "json",
            timeout: { request: 5000 }
        });

        const bans = res.body;

        if (!Array.isArray(bans)) return;

        if (lastBans.length === 0) {
            lastBans = bans;
            return;
        }

        const oldUsernames = new Set(lastBans.map(b => b.username));

        const newBans = bans.filter(b => !oldUsernames.has(b.username));

        if (newBans.length > 0) {
            const channel = await client.channels.fetch(process.env.BAN_LOG_CHANNEL);

            for (const ban of newBans) {
                const date = new Date(ban.bannedAt * 1000).toLocaleString();

                await channel.send(`
🚫 **New clan ban detected!**
**User:** ${ban.username}
**Banned by:** ${ban.bannedBy}
**Date:** ${date}
                `);
            }
        }

        lastBans = bans;

    } catch (err) {
        console.error("❌ Error checking bans:", err.message);
    }
}

// Interval: elke 2 minuten
setInterval(checkClanBans, 2 * 60 * 1000);
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
