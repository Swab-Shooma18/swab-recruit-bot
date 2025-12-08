import 'dotenv/config';
import express from 'express';
import {
    InteractionResponseType,
    InteractionType,
    verifyKeyMiddleware,
} from 'discord-interactions';

import { getKillCount } from './utils/getKillCount.js';
import { getDeathCount } from './utils/getDeathCount.js';
import { getJadAndSkotizo } from './utils/getJadAndSkotizo.js';
import PlayerTracking from './models/PlayerTracking.js';
import { connectDB } from './utils/database.js';
import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ========================
// Helper: Send followup
// ========================
async function sendFollowup(token, body) {
    try {
        await axios.post(
            `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${token}`,
            body,
            { headers: { 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('Error sending followup:', err);
    }
}

// ========================
// Interaction endpoint
// ========================
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
    const { type, data } = req.body;

    // Ping
    if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    // Only handle application commands
    if (type !== InteractionType.APPLICATION_COMMAND) {
        console.error('Unknown interaction type', type);
        return res.status(400).json({ error: 'unknown interaction type' });
    }

    const { name, options } = data;

    // ------------------------
    // /player command
    // ------------------------
    if (name.toLowerCase() === 'player') {
        const username = options[0].value;

        try {
            // Deferred response
            await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

            const resAPI = await axios.get(
                `https://api.roatpkz.ps/api/v1/player/${encodeURIComponent(username)}`,
                { headers: { 'x-api-key': process.env.ROAT_API_KEY }, timeout: 5000 }
            );

            const p = resAPI.data;
            if (!p || !p.username) {
                return await sendFollowup(data.token, { content: `❌ Player **${username}** not found!` });
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

            await sendFollowup(data.token, { embeds: [embed] });

        } catch (err) {
            console.error('PLAYER COMMAND ERROR:', err);
            await sendFollowup(data.token, { content: '❌ Error while fetching player data.' });
        }
        return;
    }

    // ------------------------
    // /add command
    // ------------------------
    if (name.toLowerCase() === 'add') {
        const username = options[0].value;

        try {
            const exists = await PlayerTracking.findOne({
                username: { $regex: `^${username}$`, $options: 'i' }
            });

            if (exists) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `⚠️ **${username}** already added!` }
                });
            }

            const kills = await getKillCount(username);
            const deaths = await getDeathCount(username);
            const jadAndSkotizo = await getJadAndSkotizo(username);

            if (!kills || !deaths) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `❌ USERNAME (**${username}**) NOT FOUND ON THE ROAT PKZ HIGHSCORES!` }
                });
            }

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

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `✅ **${username} added to the database! (Started tracking from: ${today})**
🔥 Kills: **${kills.kills}**
💀 Deaths: **${deaths}**
🏆 Elo: **${kills.elo}**
🌋 Jad kills: **${jadAndSkotizo.jad}**
👹 Skotizo kills: **${jadAndSkotizo.skotizo}**`
                }
            });

        } catch (err) {
            console.error('ADD COMMAND ERROR:', err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '❌ ERROR WHILE SAVING. PLEASE TRY AGAIN.' }
            });
        }
    }

    // ------------------------
    // /jadandskotizo command
    // ------------------------
    if (name.toLowerCase() === 'jadandskotizo') {
        const username = options[0].value;

        try {
            await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

            const { jad, skotizo } = await getJadAndSkotizo(username);

            await sendFollowup(data.token, {
                content: `🌋 **${username} – Jad & Skotizo Kills**
🌋 TzTok-Jad Kills: **${jad}**
👹 Skotizo Kills: **${skotizo}**`
            });

        } catch (err) {
            console.error('JADANDSKOTIZO COMMAND ERROR:', err);
            await sendFollowup(data.token, { content: '❌ Error fetching Jad/Skotizo kills' });
        }
        return;
    }

    // ------------------------
    // /check command
    // ------------------------
    if (name.toLowerCase() === 'check') {
        const username = options[0].value;

        try {
            await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

            const player = await PlayerTracking.findOne({ username: { $regex: `^${username}$`, $options: 'i' } });
            if (!player) {
                return await sendFollowup(data.token, { content: `❌ NO TRACKING FOUND FOR **${username}**` });
            }

            const liveKills = await getKillCount(username);
            const liveDeaths = await getDeathCount(username);
            const liveJadAndSkotizo = await getJadAndSkotizo(username);

            const liveKillCount = Number(liveKills.kills);
            const liveDeathCount = Number(liveDeaths);
            const liveJad = Number(liveJadAndSkotizo.jad || 0);
            const liveSkotizo = Number(liveJadAndSkotizo.skotizo || 0);

            const diffKills = liveKillCount - Number(player.kills);
            const diffDeaths = liveDeathCount - Number(player.deaths);
            const diffJad = liveJad - Number(player.jad || 0);
            const diffSkotizo = liveSkotizo - Number(player.skotizo || 0);

            const diff = (val) => (val >= 0 ? `+${val}` : `${val}`);

            await sendFollowup(data.token, {
                content: `📊 **Progress check for ${username}**
🔥 Kills: First tracked **${player.kills}**, Now **${liveKillCount}**, Change: **${diff(diffKills)}**
💀 Deaths: First tracked **${player.deaths}**, Now **${liveDeathCount}**, Change: **${diff(diffDeaths)}**
🌋 Jad kills: First tracked **${player.jad || 0}**, Now **${liveJad}**, Change: **${diff(diffJad)}**
👹 Skotizo kills: First tracked **${player.skotizo || 0}**, Now **${liveSkotizo}**, Change: **${diff(diffSkotizo)}**
⏳ Tracked since: ${player.dateTracked}`
            });

        } catch (err) {
            console.error('CHECK COMMAND ERROR:', err);
            await sendFollowup(data.token, { content: '❌ Error while checking progress.' });
        }
        return;
    }

    // ------------------------
    // /lookup command
    // ------------------------
    if (name.toLowerCase() === 'lookup') {
        const username = options[0].value;

        try {
            await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

            const kills = await getKillCount(username);
            const deaths = await getDeathCount(username);

            if (!kills || !deaths) {
                return await sendFollowup(data.token, { content: `❌ Player not found! (**${username}**)` });
            }

            const line = Number(kills.kills) >= Number(deaths) ? '✅ POSITIVE KDR' : '❌ NEGATIVE KDR';

            await sendFollowup(data.token, {
                content: `🔍 **${username}** has **${kills.kills}** kills and **${deaths}** deaths | Elo: **${kills.elo}** (**${line}**)`
            });

        } catch (err) {
            console.error('LOOKUP COMMAND ERROR:', err);
            await sendFollowup(data.token, { content: '❌ REQUEST ERROR' });
        }
        return;
    }

    // Unknown command
    console.error(`Unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
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
