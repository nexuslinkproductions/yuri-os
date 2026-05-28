// ═══ TEAM MEMBER CONFIGURATION ═══
// Spoke bot config for team Telegram bots (Fanny, Silas, Marcel).
// Each member has their own bot token + chat ID env vars.
// Shared by telegram-team.js (webhook) and telegram-team-digest.js (scheduled).

module.exports = {
  MEMBERS: {
    fanny: {
      name: 'Fanny Kecskes',
      role: 'Marketing Manager',
      planeUserId: 'bff07aa8-a285-460b-bd38-760cd24b8513',
      projects: ['C2M', 'MFB'],
      modules: ['Social Media', 'Content', 'Campaign'],
      quietHours: { start: 22, end: 7 }, // Don't send between 22:00-07:00
      botTokenEnv: 'TELEGRAM_BOT_TOKEN_FANNY',
      chatIdEnv: 'TELEGRAM_CHAT_FANNY',
    },
    silas: {
      name: 'Silas Wirth',
      role: 'Motion Design Lead',
      planeUserId: '1d2b9cf5-7174-4d91-be58-6d0f4417d2f3',
      projects: ['C2M', 'C2I'],
      modules: ['Motion Graphics', 'Text Animation', 'Brand Design'],
      quietHours: { start: 23, end: 8 },
      botTokenEnv: 'TELEGRAM_BOT_TOKEN_SILAS',
      chatIdEnv: 'TELEGRAM_CHAT_SILAS',
    },
    marcel: {
      name: 'Marcel Spatz',
      role: 'Branch Manager Austria \u00b7 Videographer \u00b7 Color Grading',
      planeUserId: 'f7d0b647-beca-4d79-8714-4988918b19c0',
      projects: ['C2M', 'C2I'],
      modules: ['Post-Production', 'Color Grading', 'Video Production'],
      quietHours: { start: 5, end: 11 }, // Marcel is nocturnal: 21:00-05:00
      botTokenEnv: 'TELEGRAM_BOT_TOKEN_MARCEL',
      chatIdEnv: 'TELEGRAM_CHAT_MARCEL',
    }
  }
};
