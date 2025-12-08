import 'dotenv/config';
import express from 'express';
import {
    InteractionResponseType,
    InteractionType,
    verifyKeyMiddleware,
} from 'discord-interactions';
import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';

import { getKillCount } from './utils/getKillCount.js';
import { getDeathCount } from './utils/getDeathCount.js';
import { getJadAndSkotizo } from './utils/getJadAndSkotizo.js';
import PlayerTracking from './models/PlayerTracking.js';
import { connectDB } from './utils/database.js';

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ========================
// In-memory cache for /player responses
// ========================
const playerCache = new Map(); // key = username, value = { data, timestamp }
const CACHE_TTL = 10 * 1000; // 10 seconds cache

// ========================
// Helper: Send followup safely
// ========================
async function sendFollowup(token, body) {
    const MAX_RETRIES = 3;
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
        try {
            await axios.post(
                `https://discord.com/api/v10/webhooks/${process.env.WEBHOOK_ID}/${process.env.TOKEN}`,
                body,
                { headers: { 'Content-Type': 'application/json' } }
            );
            return; // success
        } catch (err) {
            attempts++;
            if (err.response?.status === 429) {
                const retryAfter = err.response.data?.retry_after || 1000;
                console.warn(`Rate limited. Retrying in ${retryAfter}ms (Attempt ${attempts}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, retryAfter));
            } else {
                console.error('Error sending followup:', err);
                return;
            }
        }
    }

    console.error('Failed to send followup after max retries.');
}

// ========================
// Interaction endpoint
// ========================
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
    const { type, data } = req.body;

    // Ping
    if (type === InteractionType.PING) return res.send({ type: InteractionResponseType.PONG });

    if (type !== InteractionType.APPLICATION_COMMAND) return res.status(400).json({ error: 'Unknown interaction type' });

    const { name, options } = data;
    const username = options[0]?.value;

    try {
        // Defer response for commands that require API calls
        await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

        switch (name.toLowerCase()) {
            // ====================
            // /player command
            // ====================
            case 'player': {
                // Check cache first
                const cached = playerCache.get(username);
                if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                    return await sendFollowup(data.token, cached.data);
                }

                const resAPI = await axios.get(
                    `https://api.roatpkz.ps/api/v1/player/${encodeURIComponent(username)}`,
                    { headers: { 'x-api-key': process.env.ROAT_API_KEY }, timeout: 5000 }
                );

                const p = resAPI.data;
                if (!p || !p.username) {
                    const notFound = { content: `❌ Player **${username}** not found!` };
                    return await sendFollowup(data.token, notFound);
                }

                const kd = p.deaths === 0 ? p.kills : (p.kills / p.deaths).toFixed(2);

                const embed = {
                    type: 'rich',
                    title: `📄 Player Lookup: ${p.display_name || p.username}`,
                    color: 0xffcc00,
                    fields: [
                        { name: '⚔️ Kills', value: `${p.kills}`, inline: true },
                        { name: '💀 Deaths', value: `${p.deaths}`, inline: true },
                        { name: '📊 K/D', value: `${kd}`, inline: true },
                        { name: '🎮 Game Mode', value: p.game_mode || 'Unknown', inline: true },
                        { name: '⭐ Rank', value: p.player_rank || 'None', inline: true },
                        { name: '💎 Donator', value: p.donator_rank || 'None', inline: true },
                        { name: '🔥 ELO', value: `${p.elo}`, inline: true },
                        { name: '🏰 Clan Rank', value: p.clan_info?.rankName || 'None', inline: true },
                        { name: '🕒 Last Seen', value: p.last_seen || 'Unknown', inline: false }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'RoatPkz API • Clan: Swab' }
                };

                const response = { embeds: [embed] };
                // Cache response
                playerCache.set(username, { data: response, timestamp: Date.now() });

                return await sendFollowup(data.token, response);
            }

            // ====================
            // /add command
            // ====================
            case 'add': {
                const exists = await PlayerTracking.findOne({ username: { $regex: `^${username}$`, $options: 'i' } });
                if (exists) return await sendFollowup(data.token, { content: `⚠️ **${username}** already added!` });

                const [kills, deaths, jadAndSkotizo] = await Promise.all([
                    getKillCount(username),
                    getDeathCount(username),
                    getJadAndSkotizo(username)
                ]);

                if (!kills || !deaths) return await sendFollowup(data.token, { content: `❌ Username (**${username}**) not found!` });

                const today = new Date().toISOString().split('T')[0];
                const stats = {
                    username,
                    kills: kills.kills,
                    deaths,
                    elo: kills.elo,
                    jadKills: jadAndSkotizo.jad,
                    skotizoKills: jadAndSkotizo.skotizo,
                    approver: 'Manual command',
                    date: today
                };

                await PlayerTracking.create(stats);

                return await sendFollowup(data.token, {
                    content: `✅ **${username} added to the database! (Tracking from ${today})**
🔥 Kills: **${kills.kills}**
💀 Deaths: **${deaths}**
🏆 Elo: **${kills.elo}**
🌋 Jad kills: **${jadAndSkotizo.jad}**
👹 Skotizo kills: **${jadAndSkotizo.skotizo}**`
                });
            }

            // ====================
            // /jadandskotizo command
            // ====================
            case 'jadandskotizo': {
                const { jad, skotizo } = await getJadAndSkotizo(username);
                return await sendFollowup(data.token, {
                    content: `🌋 **${username} – Jad & Skotizo Kills**
🌋 TzTok-Jad: **${jad}**
👹 Skotizo: **${skotizo}**`
                });
            }

            // ====================
            // /check command
            // ====================
            case 'check': {
                const player = await PlayerTracking.findOne({ username: { $regex: `^${username}$`, $options: 'i' } });
                if (!player) return await sendFollowup(data.token, { content: `❌ NO TRACKING FOUND FOR **${username}**` });

                const [liveKills, liveDeaths, liveJadAndSkotizo] = await Promise.all([
                    getKillCount(username),
                    getDeathCount(username),
                    getJadAndSkotizo(username)
                ]);

                const diff = (val) => (val >= 0 ? `+${val}` : `${val}`);
                const liveKillCount = Number(liveKills.kills);
                const liveDeathCount = Number(liveDeaths);
                const liveJad = Number(liveJadAndSkotizo.jad || 0);
                const liveSkotizo = Number(liveJadAndSkotizo.skotizo || 0);

                return await sendFollowup(data.token, {
                    content: `📊 **Progress check for ${username}**
🔥 Kills: First tracked **${player.kills}**, Now **${liveKillCount}**, Change: **${diff(liveKillCount - player.kills)}**
💀 Deaths: First tracked **${player.deaths}**, Now **${liveDeathCount}**, Change: **${diff(liveDeathCount - player.deaths)}**
🌋 Jad kills: First tracked **${player.jad || 0}**, Now **${liveJad}**, Change: **${diff(liveJad - (player.jad || 0))}**
👹 Skotizo kills: First tracked **${player.skotizo || 0}**, Now **${liveSkotizo}**, Change: **${diff(liveSkotizo - (player.skotizo || 0))}**
⏳ Tracked since: ${player.dateTracked}`
                });
            }

            // ====================
            // /lookup command
            // ====================
            case 'lookup': {
                const [kills, deaths] = await Promise.all([getKillCount(username), getDeathCount(username)]);
                if (!kills || !deaths) return await sendFollowup(data.token, { content: `❌ Player not found! (**${username}**)` });

                const line = Number(kills.kills) >= Number(deaths) ? '✅ POSITIVE KDR' : '❌ NEGATIVE KDR';
                return await sendFollowup(data.token, {
                    content: `🔍 **${username}** has **${kills.kills}** kills and **${deaths}** deaths | Elo: **${kills.elo}** (**${line}**)`
                });
            }

            default:
                return await sendFollowup(data.token, { content: `❌ Unknown command: ${name}` });
        }

    } catch (err) {
        console.error(`${name.toUpperCase()} COMMAND ERROR:`, err);
        return await sendFollowup(data.token, { content: `❌ Error executing ${name} command.` });
    }
});

// ========================
// Bot login
// ========================
await connectDB();
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Bot logged in!'))
    .catch(err => console.error('Login failed:', err));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

export default client;
