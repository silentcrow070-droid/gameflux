// api/news.js — 頂尖 10 大媒體 + 近一週過濾
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  // 計算 7 天前的日期 (ISO 8601 格式: YYYY-MM-DDTHH:MM:SSZ)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const fromDate = oneWeekAgo.toISOString().split('.')[0] + 'Z'; 

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
      // 加入 from 參數限制時間
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&max=15&from=${fromDate}&apikey=${apiKey}${conf.country ? `&country=${conf.country}` : ''}`;
      
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
          combined.push({
            title: a.title,
            summary: a.description || '',
            url: a.url,
            image: a.image || null,
            source: a.source?.name || 'News',
            date: a.publishedAt ? a.publishedAt.split('T')[0] : '',
            timestamp: new Date(a.publishedAt).getTime()
          });
        });
      }
    });

    combined.sort((a, b) => b.timestamp - a.timestamp);

    if (combined.length === 0) {
      return res.status(404).json({ error: "近一週內各大站無更新內容。" });
    }

    return res.status(200).json({ articles: combined });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
