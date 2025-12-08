import 'dotenv/config';
import express from 'express';
import {
    InteractionResponseType,
    InteractionType,
    verifyKeyMiddleware,
} from 'discord-interactions';
import { Client, GatewayIntentBits } from 'discord.js';
import got from 'got';

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
            timeout: 5000,
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
        title: `📄 Player Lookup: ${playerData.display_name || playerData.username}`,
        color: 0xffcc00,
        fields: [
            { name: '⚔️ Kills', value: `${playerData.kills}`, inline: true },
            { name: '💀 Deaths', value: `${playerData.deaths}`, inline: true },
            { name: '📊 K/D', value: `${kd}`, inline: true },
            { name: '🔥 ELO', value: `${playerData.elo}`, inline: true },
            { name: '🏰 Clan Rank', value: playerData.clan_info?.rankName || 'None', inline: true },
            { name: '💎 Donator', value: DONATOR_RANKS[playerData.donator_rank] || 'None', inline: true },
            { name: '🌋 Jad', value: playerData.jad || '0', inline: true },
            { name: '👹 Skotizo', value: playerData.skotizo || '0', inline: true },
            { name: '🕒 Last Seen', value: playerData.last_seen || 'Unknown', inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roat Pkz API • Clan: Swab' }
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

// ========================
// Start bot & server
// ========================
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Bot logged in!'))
    .catch(err => console.error('Login failed:', err));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

export default client;
