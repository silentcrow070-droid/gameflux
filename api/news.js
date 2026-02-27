// api/news.js — 方案 A：30分鐘長效快取版
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 核心修改：s-maxage=1800 代表 Vercel 會快取結果 30 分鐘
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const fromDate = twentyFourHoursAgo.toISOString().split('.')[0] + 'Z'; 

  const configs = [
    { 
      lang: 'zh', 
      country: 'tw', 
      q: '"巴哈姆特" OR "4Gamers" OR "遊戲基地" OR "電玩宅速配" OR "IGN"' 
    },
    { 
      lang: 'en', 
      q: '"IGN" OR "GameSpot" OR "PC Gamer" OR "Eurogamer" OR "GamesRadar"' 
    }
  ];

  try {
    const requests = configs.map(conf => {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&from=${fromDate}&max=15&apikey=${apiKey}${conf.country ? `&country=${conf.country}` : ''}`;
      return fetch(url).then(async r => {
        const d = await r.json();
        if (!r.ok) return { error: d.errors || 'API error' };
        return d;
      });
    });

    const results = await Promise.all(requests);
    let combined = [];

    results.forEach(data => {
      if (data && data.articles) {
        data.articles.forEach(a => {
          const pubDate = new Date(a.publishedAt);
          const timeStr = pubDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
          
          combined.push({
            title: a.title,
            url: a.url,
            image: a.image || null,
            source: a.source?.name || 'News',
            time: timeStr,
            timestamp: pubDate.getTime()
          });
        });
      }
    });

    combined.sort((a, b) => b.timestamp - a.timestamp);
    return res.status(200).json({ articles: combined });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
