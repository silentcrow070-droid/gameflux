// api/news.js — 嚴格限制 10 大主流媒體版
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  // 嚴格定義 10 大來源
  // 中文：巴哈姆特, 4Gamers, 遊戲基地, 電玩宅速配, IGN Taiwan
  // 英文：IGN, GameSpot, PC Gamer, Eurogamer, GamesRadar
  const configs = [
    { 
      lang: 'zh', 
      country: 'tw', 
      q: '遊戲 AND ("巴哈姆特" OR "4Gamers" OR "遊戲基地" OR "電玩宅速配" OR "IGN")' 
    },
    { 
      lang: 'en', 
      q: 'gaming AND ("IGN" OR "GameSpot" OR "PC Gamer" OR "Eurogamer" OR "GamesRadar")' 
    }
  ];

  try {
    const requests = configs.map(conf => {
      let url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&max=15&apikey=${apiKey}`;
      if (conf.country) url += `&country=${conf.country}`;
      
      return fetch(url).then(async r => {
        const d = await r.json();
        if (!r.ok) return { error: d.errors || 'API limit' };
        return d;
      });
    });

    const results = await Promise.all(requests);
    let combined = [];

    results.forEach(data => {
      if (data && data.articles) {
        data.articles.forEach(a => {
          combined.push({
            title: a.title,
            summary: a.description || '',
            url: a.url,
            image: a.image || null,
            source: a.source?.name || 'News',
            date: a.publishedAt ? a.publishedAt.slice(0, 10) : '',
            timestamp: new Date(a.publishedAt || Date.now()).getTime()
          });
        });
      }
    });

    // 依發布時間排序
    combined.sort((a, b) => b.timestamp - a.timestamp);

    if (combined.length === 0) {
      return res.status(404).json({ error: "No articles found from specified top 10 sources." });
    }

    return res.status(200).json({ articles: combined });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
