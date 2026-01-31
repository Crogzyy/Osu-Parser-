import axios from 'axios';

export const handler = async (event) => {
  // Netlify gets parameters from event.queryStringParameters
  const { url } = event.queryStringParameters || {};
  
  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing match URL" })
    };
  }

  const matchId = url.split('/').pop();

  try {
    // 1. Get OAuth Token
    const authRes = await axios.post('https://osu.ppy.sh/oauth/token', {
      client_id: process.env.OSU_CLIENT_ID,
      client_secret: process.env.OSU_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'public'
    });

    // 2. Fetch Match Data
    const matchRes = await axios.get(`https://osu.ppy.sh/api/v2/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${authRes.data.access_token}` }
    });

    const data = matchRes.data;
    const userMap = {};
    data.users.forEach(u => { userMap[u.id] = { name: u.username, avatar: u.avatar_url }; });

    // 3. Process Games
    const games = data.events.filter(e => e.game).map(e => {
      const g = e.game;
      const rulesets = ["Osu", "Taiko", "Catch", "Mania"];
      const teamModes = ["Head-to-Head", "Tag Co-op", "Team Vs", "Tag Team Vs"];

      let rScore = 0, bScore = 0, rPlayers = [], bPlayers = [];

      g.scores.forEach((s, idx) => {
        const u = userMap[s.user_id] || { name: "Unknown", avatar: "" };
        const pObj = { 
          name: u.name, 
          avatar: u.avatar, 
          score: parseInt(s.score || 0), 
          accuracy: (s.accuracy * 100).toFixed(2), 
          combo: s.max_combo || 0, 
          grade: s.rank || "F" 
        };

        // Split players in Head-to-Head (mode 0/1) or assign by team (mode 2/3)
        let isRed = (s.team === 2) || (g.team_mode < 2 && idx === 0);

        if (isRed) { rScore += pObj.score; rPlayers.push(pObj); } 
        else { bScore += pObj.score; bPlayers.push(pObj); }
      });

      return {
        mapDisplay: `${g.beatmapset.title} [${g.beatmap.version}]`,
        backdrop: `https://assets.ppy.sh/beatmaps/${g.beatmapset.id}/covers/cover.jpg`,
        gameMode: rulesets[g.ruleset_id] || "Osu",
        matchType: teamModes[g.team_mode] || "Standard",
        red: rScore, 
        blue: bScore,
        winner: rScore > bScore ? "Red Wins" : (bScore > rScore ? "Blue Wins" : "Draw"),
        redPlayers: rPlayers, 
        bluePlayers: bPlayers
      };
    });

    // Netlify requires returning an object with statusCode and body
    return {
      statusCode: 200,
      body: JSON.stringify({ id: data.match.id, matchName: data.match.name, games: games.reverse() })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
