import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';
// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CHECK_COMMAND = {
  name: 'check',
  description: 'Compare username with roat pkz highscores and our database!',
  options: [
    {
      type: 3, // STRING
      name: "username",
      description: "RoatPkz username",
      required: true,
    }
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Command containing options
const CHALLENGE_COMMAND = {
  name: 'challenge',
  description: 'Challenge to a match of rock paper scissors',
  options: [
    {
      type: 3,
      name: 'object',
      description: 'Pick your object',
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const LOOKUP_COMMAND = {
  name: "lookup",
  description: "Lookup RoatPkz hiscore stats",
  options: [
    {
      type: 3, // STRING
      name: "username",
      description: "RoatPkz username",
      required: true,
    }
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const JAD_SKOTIZO_COMMAND = {
  name: "jadandskotizo",
  description: "Lookup RoatPkz hiscore stats for jad and skotizo",
  options: [
    {
      type: 3, // STRING
      name: "username",
      description: "RoatPkz username",
      required: true,
    }
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ADD_COMMAND = {
  name: 'add',
  description: 'Add a player manually to the tracking database.',
  options: [
    {
      type: 3, // STRING
      name: "username",
      description: "RoatPkz username",
      required: true,
    }
  ],
  type: 1,
};

const PLAYER_COMMAND = {
  name: 'player',
  description: 'Shows all player information',
  options: [
    {
      type: 3, // STRING
      name: "username",
      description: "RoatPkz username",
      required: true,
    }
  ],
  type: 1,
};

const TESTWARFARE_COMMAND = {
  name: 'testwarfare',
  description: 'Send a test message with the latest clan warfare result',
  type: 1,
};

const CHECKVOICE_COMMAND = {
  name: 'checkvoice',
  description: 'Check how much time a user spent in voice this week',
  options: [
    {
      type: 6, // USER
      name: 'user',
      description: 'Select a Discord user',
      required: true,
    }
  ],
  type: 1,
};

const GIVE_BAN_RIGHTS_COMMAND = {
  name: "linkusername",
  description: "Link ingame username to discord. Used for automatic ban messages.",
  options: [
    {
      type: 6, // USER
      name: "discorduser",
      description: "Discord user to give ban rights",
      required: true
    },
    {
      type: 3, // STRING
      name: "username",
      description: "In-game username of the Discord user",
      required: true
    }
  ],
  type: 1
};

const REMOVE_BAN_RIGHTS_COMMAND = {
  name: "removelink",
  description: "Remove Discord-ban rights mapping for a given in-game username.",
  options: [
    {
      type: 3, // STRING
      name: "username",
      description: "In-game username to remove the mapping for",
      required: true
    }
  ],
  type: 1
};

const TOP_KILLERS_COMMAND = {
  name: "topkillers",
  description: "Shows the top killers in the clan based on player stats.",
  options: [
    {
      type: 4,
      name: "limit",
      description: "Number of top players to show (default 10)",
      required: false
    }
  ],
  type: 1
};


const WEEKLY_TOP_COMMAND = {
  name: "weekly",
  description: "Shows the weekly top killers in the clan.",
  options: [
    {
      type: 4, // INTEGER
      name: "limit",
      description: "Number of top players to show (default 10)",
      required: false
    }
  ],
  type: 1 // TYPE 1 = CHAT_INPUT (slash command)
};

const RESET_WEEKLY_COMMAND = {
  name: "resetweekly",
  description: "Resets all weekly kills to 0 for a new week.",
  type: 1 // CHAT_INPUT
};

const ALL_COMMANDS = [TEST_COMMAND, CHALLENGE_COMMAND,LOOKUP_COMMAND,JAD_SKOTIZO_COMMAND,CHECK_COMMAND,ADD_COMMAND,PLAYER_COMMAND,CHECKVOICE_COMMAND,TESTWARFARE_COMMAND,GIVE_BAN_RIGHTS_COMMAND,REMOVE_BAN_RIGHTS_COMMAND,TOP_KILLERS_COMMAND,WEEKLY_TOP_COMMAND,RESET_WEEKLY_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
