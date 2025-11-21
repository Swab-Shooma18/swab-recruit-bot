import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';

import { getKillCount } from './utils/getKillCount.js';
import {getDeathCount} from "./utils/getDeathCount.js";
import { Client, GatewayIntentBits } from 'discord.js';
import {getJadAndSkotizo} from "./utils/getJadAndSkotizo.js";


const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { id, type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;


    if (name === 'jadandskotizo') {
      const username = options[0].value;

      try {
        const { jad, skotizo } = await getJadAndSkotizo(username);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
                `🌋 **${username} – Jad & Skotizo Kills**
🔥 TzTok-Jad Kills: **${jad}**
👹 Skotizo Kills: **${skotizo}**`
          }
        });

      } catch (err) {
        console.error("jadandskotizo ERROR:", err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `❌ Error fetching Jad/Skotizo kills` }
        });
      }
    }


    //
    // ---------- /lookup <username> ----------
    //
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
            data: { content: `❌ Player not found! (**${username}**)` }
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
          data: { content: `🔍 **${username}** has **${kills.kills}** kills and **${deaths}** deaths | Elo: **${kills.elo}** (**${line}**)` }
        });

      } catch (err) {
        console.error(err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `❌ REQUEST ERROR` }
        });
      }
    } else {
      console.error(`Unknown command: ${name}`);
      return res.status(400).json({ error: 'unknown command' });
    }
  } else {
    console.error('Unknown interaction type', type);
    return res.status(400).json({ error: 'unknown interaction type' });
  }
});

export default function registerEventListeners(client) {

  client.on('messageCreate', async (message) => {
    // Check dat het van de Apply-bot komt en in #accept
    if (message.channelId !== process.env.ACCEPT_CHANNEL_ID) return;
    if (!message.author.bot) return;
    if (!message.embeds?.length) return;

    const embed = message.embeds[0];
    const title = embed.title;
    if (!title || !title.includes('Application Submitted')) return;

    // Pak de Submission stats embed field
    const statsField = embed.fields.find(f => f.name === "Submission stats");
    if (!statsField) return;

    // Haal Discord user ID
    const idMatch = statsField.value.match(/User: <@(\d+)>/);
    if (!idMatch) return;
    const discordUserId = idMatch[1];

    try {
      // Haal member op en pak nickname
      const guild = await client.guilds.fetch(message.guildId);
      const member = await guild.members.fetch(discordUserId);
      const discordUsername = member.displayName; // nickname in server
      const dateToday = new Date().toISOString().split("T")[0];

      const approverMatch = message.content.match(/by\s+@?([^\s]+)/);
      const approverUsername = approverMatch ? approverMatch[1] : "unknown";



      console.log("Accepted username:", discordUsername);

      // Lookup kills & deaths
      const kills = await getKillCount(discordUsername);
      const deaths = await getDeathCount(discordUsername);
      const killsValue = Number(kills.kills);
      const deathsValue = Number(deaths);
      let line = "";



      // Stuur naar recruit-tracker
      const recruitChannel = await client.channels.fetch(process.env.RECRUIT_CHANNEL_ID);
      if (!recruitChannel) return console.log("❌ Recruit channel not found");

      if (killsValue < deathsValue) {
        line = "❌ NEGATIVE KDR";
      } else {
        line = "✅ POSITIVE KDR";
      }

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
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Bot logged in!'))
    .catch(err => console.error('Login failed:', err));
registerEventListeners(client);
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));