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
import BanRights from "./utils/banRights.js";
import {ClanMember} from "./utils/member.js";
import { PlayerKills } from './utils/playerKills.js'


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


let lastWarfareKey = null;
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

    if (name === 'testwarfare') {
        try {
            const resAPI = await got('https://api.roatpkz.ps/api/v1/events/clan-warfare', {
                headers: { 'x-api-key': process.env.ROAT_API_KEY },
                responseType: 'json',
                timeout: { request: 5000 }
            });


            const latest = resAPI.body?.content?.[0];
            if (!latest) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: '❌ No warfare data found.' }
                });
            }

            if (latest.winnerClan === "Swab") {
                const embed = {
                    color: 0x2ecc71,
                    title: "🏆 Clan Warfare Won! (LATEST)",
                    description: "**Swab** has won a clan warfare 💪",
                    fields: [
                        { name: "🥇 Winner", value: latest.winnerClan, inline: true },
                        { name: "⚔️ Winner Kills", value: `${latest.winnerKills}`, inline: true },
                        { name: "🏰 Total Clans", value: `${latest.totalClans}`, inline: true },
                        { name: "💀 Total Kills", value: `${latest.totalKills}`, inline: true },
                        { name: "📍 Location", value: latest.location || "Unknown", inline: true },
                        { name: "🕒 When", value: latest.timeAgo, inline: true }
                    ],
                    footer: { text: "USED COMMAND • Clan Warfare" },
                    timestamp: new Date().toISOString()
                };
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        embeds: [embed]
                    }
                });
            }

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content:
                        `🏆 **Clan Warfare (TEST)**
Winner: **${latest.winnerClan}**
Winner Kills: **${latest.winnerKills}**
Total Clans: **${latest.totalClans}**
Total Kills: **${latest.totalKills}**
📍 Location: **${latest.location}**
🕒 ${latest.timeAgo}`
                }
            });
        } catch (err) {
            console.error(err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '❌ Failed to fetch warfare data.' }
            });
        }
    }

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

    if (name === "topvoice") {
        try {
            const weekKey = getWeekKey();
            const guild = await client.guilds.fetch(req.body.guild_id);


// haal alle voice entries voor de guild
            const docs = await VoiceTracking.find({ guildId: req.body.guild_id });


// bereken per user hun tijd deze week
            const list = await Promise.all(docs.map(async doc => {
                let ms = doc.weekly[weekKey] || 0;
                if (doc.joinedAt) ms += Date.now() - doc.joinedAt;


                let username = `<@${doc.userId}>`; // fallback
                try {
                    const member = await guild.members.fetch(doc.userId);
                    username = member.displayName;
                } catch {} // user left → fallback


                return { username, ms };
            }));


// sorteer en pak top 10
            const top = list.sort((a, b) => b.ms - a.ms).slice(0, 10);


            const formatTime = ms => {
                const h = Math.floor(ms / 3600000);
                const m = Math.floor((ms % 3600000) / 60000);
                return `${h}h ${m}m`;
            };


            const embed = {
                color: 0x5865F2,
                title: `🎧 Top 10 Voice Activity (This Week)`,
                description: top.map((u, i) => `#${i + 1} **${u.username}** – ${formatTime(u.ms)}`).join('\n'),
                footer: { text: `Week: ${weekKey}` },
                timestamp: new Date()
            };


            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { embeds: [embed] }
            });


        } catch (err) {
            console.error(err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '❌ Failed to fetch top voice stats.' }
            });
        }
    }

    if (name === "checkvoice") {
        const user = options[0].value;
        const weekKey = getWeekKey();
        const userId = options[0].value;
        const guild = await client.guilds.fetch(req.body.guild_id);
        const member = await guild.members.fetch(userId);

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

        const voiceStatus = member.voice.channel
            ? `🟢 In voice: **${member.voice.channel.name}**`
            : `⚪ Not in voice`;

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                embeds: [{
                    color: 0x5865F2,
                    title: "🎧 Voice Activity (beta)",
                    description: `<@${user}> has spent **${hours}h ${remainingMinutes}m** in voice **this week**. 
                    ${voiceStatus}`,
                    footer: { text: `Week: ${weekKey}` }
                }]
            }
        });
    }

    if (name === "linkusername") {
        const discordUserId = options[0].value;
        const inGameName = options[1].value;


        try {
            const existing = await BanRights.findOne({ discordId: discordUserId });
            if (existing) {
                existing.inGameName = inGameName;
                await existing.save();
            } else {
                await BanRights.create({ discordId: discordUserId, inGameName });
            }


            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `✅ <@${discordUserId}> is now linked to in-game name **${inGameName}**` }
            });
        } catch (err) {
            console.error(err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `❌ Could not set ban rights` }
            });
        }
    }


    if (name === 'topkillers') {
        const top = await ClanMember.find().sort({ kills: -1 }).limit(10).lean();


        if (!Array.isArray(top) || top.length === 0) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '❌ No data found.' }
            });
        }


        const embed = {
            color: 0x1abc9c,
            title: "🏆 Top 10 Killers",
            description: top.map((m, i) => `#${i + 1} **${m.username}** – ${m.kills} kills`).join('\n'),
            footer: { text: 'Clan Stats' },
            timestamp: new Date().toISOString()
        };


        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { embeds: [embed] }
        });
    }


    if (name === 'resetweekly') {
        try {
            const members = await ClanMember.find({}, { username: 1, kills: 1 });


            for (const m of members) {
                await PlayerKills.findOneAndUpdate(
                    { username: m.username },
                    {
                        weeklyKills: 0,
                        lastTotalKills: m.kills,
                        lastUpdated: new Date()
                    },
                    { upsert: true }
                );
            }


            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '✅ Weekly kills have been reset. New week starts now!'
                }
            });


        } catch (err) {
            console.error('❌ resetweekly failed:', err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Failed to reset weekly kills.'
                }
            });
        }
    }

    if (name === 'weekly') {
        try {
            const limit = 10; // Optioneel: kan uit de command-optie komen


// Haal top 10 spelers op op basis van weeklyKills
            const topMembers = await PlayerKills.find()
                .sort({ weeklyKills: -1 })
                .limit(limit)
                .lean();


            if (!Array.isArray(topMembers) || topMembers.length === 0) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: '⚠️ No weekly kill data found.' }
                });
            }


            const embed = {
                color: 0x1abc9c,
                title: "🏆 Weekly Top 10 Killers",
                description: topMembers
                    .map((player, index) => `#${index + 1} **${player.username}** – ${player.weeklyKills.toLocaleString()} kills`)
                    .join('\n'),
                footer: { text: 'Clan Stats • Weekly Ranking' },
                timestamp: new Date()
            };


            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { embeds: [embed] }
            });


        } catch (err) {
            console.error("❌ Error fetching weekly top killers:", err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '❌ Failed to fetch weekly top killers.' }
            });
        }
    }

    if (name === 'removelink') {
        const inGameName = options[0].value;


        const result = await BanRights.findOneAndDelete({ inGameName });


        if (result) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `✅ Removed username mapping for **${inGameName}**` }
            });
        } else {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `⚠️ No mapping found for **${inGameName}**` }
            });
        }
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

            const oldIgnored = oldState.channelId && IGNORED_VOICE_CHANNELS.includes(oldState.channelId);
            const newIgnored = newState.channelId && IGNORED_VOICE_CHANNELS.includes(newState.channelId);


            const record = await VoiceTracking.findOne({ userId, guildId });

            if (!oldState.channelId && newState.channelId && !newIgnored) {
                await VoiceTracking.findOneAndUpdate(
                    { userId, guildId },
                    { joinedAt: Date.now() },
                    { upsert: true }
                );
            }

            if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
                if (!oldIgnored && record?.joinedAt) {
                    const timeSpent = Date.now() - record.joinedAt;
                    const weekKey = getWeekKey();
                    const current = record.weekly.get(weekKey) || 0;


                    record.weekly.set(weekKey, current + timeSpent);
                    record.joinedAt = null;
                    await record.save();
                }
                if (newState.channelId && !newIgnored) {
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


let lastWarfareId = null;
let lastBanTimestamp = 0;

async function updateClanMembers() {
    try {
        const res = await got('https://api.roatpkz.ps/api/v1/clan/members', {
            headers: { 'x-api-key': process.env.ROAT_API_KEY },
            responseType: 'json',
            timeout: { request: 5000 }
        });

        const members = res.body;
        if (!Array.isArray(members) || members.length === 0) return;

        // Haal alle spelersdata parallel op
        await Promise.all(members.map(async (member) => {
            try {
                const playerRes = await got(`https://api.roatpkz.ps/api/v1/player/${encodeURIComponent(member.username)}`, {
                    headers: { 'x-api-key': process.env.ROAT_API_KEY },
                    responseType: 'json'
                });

                const player = playerRes.body;

                // Update clan member
                await ClanMember.findOneAndUpdate(
                    { username: player.username },
                    {
                        username: player.username,
                        rankId: player.clan_info.rankId,
                        rankName: player.clan_info.rankName,
                        rankedAt: player.clan_info.rankedAt,
                        lastSeen: player.last_seen,
                        kills: player.kills,
                        deaths: player.deaths,
                        donatorRank: player.donator_rank,
                        elo: player.elo,
                        playerRank: player.player_rank,
                        npcKills: player.npc_kills,
                        skills: player.skills,
                        updatedAt: new Date()
                    },
                    { upsert: true }
                );

                // Update weekly kills
                const record = await PlayerKills.findOne({ username: player.username });


                if (!record) {
// Eerste keer
                    await PlayerKills.create({
                        username: player.username,
                        weeklyKills: 0,
                        lastTotalKills: player.kills,
                        lastUpdated: new Date()
                    });
                } else {
                    const gained = player.kills - record.lastTotalKills;


                    if (gained > 0) {
                        await PlayerKills.updateOne(
                            { username: player.username },
                            {
                                $inc: { weeklyKills: gained }, // ✅ WEEKLY += verschil
                                $set: {
                                    lastTotalKills: player.kills,
                                    lastUpdated: new Date()
                                }
                            }
                        );
                    }
                }

            } catch (err) {
                console.error(`❌ Failed to update ${member.username}:`, err.message);
            }
        }));

        console.log(`✅ Updated ${members.length} clan members`);
    } catch (err) {
        console.error("❌ Failed to fetch clan members:", err.message);
    }
}

async function checkClanBans() {
    try {
        const res = await got('https://api.roatpkz.ps/api/v1/clan/bans', {
            headers: { 'x-api-key': process.env.ROAT_API_KEY },
            responseType: 'json',
            timeout: { request: 5000 }
        });

        const bans = res.body;
        if (!Array.isArray(bans) || bans.length === 0) return;

        const newBans = bans.filter(b => b.bannedAt > lastBanTimestamp);
        if (newBans.length === 0) return;


        lastBanTimestamp = Math.max(...newBans.map(b => b.bannedAt));


        const channel = await client.channels.fetch(process.env.BAN_CHANNEL);
        if (!channel) return console.log("❌ Ban channel not found");

        const discordMentions = [];
        const banEntries = await Promise.all(
            newBans.slice(0, 10).map(async (ban) => {
                const mod = await BanRights.findOne({ inGameName: ban.bannedBy });
                let modLine = ban.bannedBy;


                if (mod) {
                    modLine = `<@${mod.discordId}> (IG: ${ban.bannedBy})`;
                    discordMentions.push(mod.discordId);
                }


                return `**${ban.username}**\n🔨 Banned by: ${modLine}\n🕒 <t:${ban.bannedAt}:R>`;
            })
        );


        const embed = {
            color: 0xe74c3c,
            title: `🚫 ${newBans.length} New Clan Ban(s)`,
            description: banEntries.join('\n\n'),
            footer: {
                text: newBans.length > 10
                    ? `Showing 10 of ${newBans.length} bans`
                    : 'Clan Moderation'
            },
            timestamp: new Date(lastBanTimestamp * 1000).toISOString()
        };


        await channel.send({
            embeds: [embed],
            allowedMentions: { users: discordMentions } // ✅ Zorgt dat de mods echt gepingd worden
        });


        console.log(`✅ Sent ${newBans.length} new ban(s) notification`);


    } catch (err) {
        console.error("❌ Error checking clan bans:", err.message);
    }
}

async function checkClanWarfare() {
    try {
        const res = await got(
            'https://api.roatpkz.ps/api/v1/events/clan-warfare',
            {
                headers: { 'x-api-key': process.env.ROAT_API_KEY },
                responseType: 'json',
                timeout: { request: 5000 }
            }
        );


        const latest = res.body?.content?.[0];
        if (!latest || !latest.winnerClan) return;


        const warfareKey = `${latest.createdAt}_${latest.winnerClan}_${latest.totalKills}`;


        if (lastWarfareKey === warfareKey) return;


        const channel = await client.channels.fetch(process.env.WARFARE_CHANNEL);
        if (!channel) return;


        if (latest.winnerClan === "Swab") {
            const embed = {
                color: 0x2ecc71,
                title: "🏆 Clan Warfare Won!",
                description: "**Swab** has won a clan warfare 💪",
                fields: [
                    { name: "🥇 Winner", value: latest.winnerClan, inline: true },
                    { name: "⚔️ Winner Kills", value: `${latest.winnerKills}`, inline: true },
                    { name: "🏰 Total Clans", value: `${latest.totalClans}`, inline: true },
                    { name: "💀 Total Kills", value: `${latest.totalKills}`, inline: true },
                    { name: "📍 Location", value: latest.location || "Unknown", inline: true }
                ],
                footer: { text: "RoatPkz • Clan Warfare" },
                timestamp: new Date().toISOString()
            };


            await channel.send({
                content: "@here",
                embeds: [embed],
                allowedMentions: { parse: ['here'] }
            });


            console.log("✅ Warfare embed sent");
        } else {
            await channel.send(
                `🏆 **Clan Warfare Result**
Winner: **${latest.winnerClan}**
Winner Kills: **${latest.winnerKills}**
Total Clans: **${latest.totalClans}**
Total Kills: **${latest.totalKills}**
📍 Location: **${latest.location || 'Unknown'}**`
            );


            console.log("ℹ️ Warfare text sent");
        }


// ❗ pas NA succesvol verzenden
        lastWarfareKey = warfareKey;


    } catch (err) {
        console.error("❌ Error checking clan warfare:", err);
    }
}

setInterval(checkClanBans, 60_000);
setInterval(checkClanWarfare, 1 * 60 * 1000);
setInterval(updateClanMembers, 5 * 60 * 1000);
updateClanMembers();
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
