// api/news.js — 中英混合主流媒體版
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Vercel 邊緣快取 10 分鐘，避免頻繁消耗 API 額度
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  // 定義搜尋配置：
  // 中文：鎖定台灣地區，過濾巴哈、IGN、4Gamers
  // 英文：鎖定美國地區，過濾 IGN、GameSpot、PC Gamer
  const configs = [
    { lang: 'zh', country: 'tw', q: '(新作 OR 評測 OR 熱門) AND (IGN OR 巴哈姆特 OR 4Gamers OR 遊戲基地)' },
    { lang: 'en', country: 'us', q: '(New Release OR Review OR Trending) AND (IGN OR GameSpot OR PC Gamer OR Eurogamer)' }
  ];

  try {
    const requests = configs.map(conf => {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&country=${conf.country}&max=10&apikey=${apiKey}`;
      return fetch(url).then(r => r.json());
    });

    const results = await Promise.all(requests);
    
    let combined = [];
    results.forEach(data => {
      if (data.articles) {
        data.articles.forEach(a => {
          combined.push({
            title: a.title,
            summary: a.description || '',
            url: a.url,
            image: a.image || null,
            source: a.source?.name || 'News',
            date: a.publishedAt?.slice(0, 10) || '',
            timestamp: new Date(a.publishedAt).getTime()
          });
        });
      }
    });

    // 依發布時間排序（最新的在前）
    combined.sort((a, b) => b.timestamp - a.timestamp);

    return res.status(200).json({ articles: combined });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
