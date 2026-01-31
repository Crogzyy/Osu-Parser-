// api/getMatch.js
import axios from 'axios';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "No URL provided" });

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
    const matchTitle = data.match.name;


    const teamContext = matchTitle.match(/\(([^)]+)\) vs \(([^)]+)\)/);
    const redSearch = teamContext ? teamContext[1].toLowerCase() : null;
    const blueSearch = teamContext ? teamContext[2].toLowerCase() : null;

    const userMap = {};
    data.users.forEach(u => { userMap[u.id] = { name: u.username, avatar: u.avatar_url }; });

    const games = data.events.filter(e => e.game).map(e => {
      const g = e.game;
      const rulesets = ["Osu", "Taiko", "Catch", "Mania"];
      const teamModes = ["Head-to-Head", "Tag Co-op", "Team Vs", "Tag Team Vs"];

      let rScore = 0, bScore = 0, rPlayers = [], bPlayers = [];

      g.scores.forEach((s, idx) => {
        const u = userMap[s.user_id] || { name: "Unknown", avatar: "" };
        const pObj = { 
          name: u.name, avatar: u.avatar, 
          score: parseInt(s.score || 0), 
          accuracy: (s.accuracy * 100).toFixed(2), 
          combo: s.max_combo || 0, grade: s.rank || "F" 
        };

        let isRed = (s.team === 2);
        if (g.team_mode < 2) {
          if (redSearch && u.name.toLowerCase().includes(redSearch)) isRed = true;
          else if (blueSearch && u.name.toLowerCase().includes(blueSearch)) isRed = false;
          else isRed = (idx === 0);
        }

        if (isRed) { rScore += pObj.score; rPlayers.push(pObj); } 
        else { bScore += pObj.score; bPlayers.push(pObj); }
      });

      return {
        mapDisplay: `${g.beatmapset.title} [${g.beatmap.version}]`,
        backdrop: `https://assets.ppy.sh/beatmaps/${g.beatmapset.id}/covers/cover.jpg`,
        mode: rulesets[g.ruleset_id] || "Osu",
        ruleset: teamModes[g.team_mode] || "Standard",
        red: rScore, blue: bScore,
        winner: rScore > bScore ? "Red Wins" : (bScore > rScore ? "Blue Wins" : "Draw"),
        redPlayers: rPlayers, bluePlayers: bPlayers
      };
    });

    res.status(200).json({ id: data.match.id, matchName: matchTitle, games: games.reverse() });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}