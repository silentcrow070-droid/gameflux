// api/news.js — 穩定版：72H 時效 + 30分鐘快取
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Vercel 快取 30 分鐘，過期後 15 分鐘內仍可提供舊資料並背景更新
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  // 計算 72 小時前 (避免 24H 內剛好無索引的狀況)
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - (72 * 60 * 60 * 1000));
  const fromDate = threeDaysAgo.toISOString().split('.')[0] + 'Z'; 

  const configs = [
    { 
      lang: 'zh', 
      country: 'tw', 
      // 移除引號，增加匹配機率
      q: '巴哈姆特 OR 4Gamers OR 遊戲基地 OR 電玩宅速配 OR IGN' 
    },
    { 
      lang: 'en', 
      q: 'IGN OR GameSpot OR PC Gamer OR Eurogamer OR GamesRadar' 
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
          // 格式化日期：05/20 14:30
          const dateStr = (pubDate.getMonth() + 1).toString().padStart(2, '0') + '/' + 
                          pubDate.getDate().toString().padStart(2, '0') + ' ' +
                          pubDate.getHours().toString().padStart(2, '0') + ':' + 
                          pubDate.getMinutes().toString().padStart(2, '0');
          
          combined.push({
            title: a.title,
            url: a.url,
            image: a.image || null,
            source: a.source?.name || 'News',
            time: dateStr,
            timestamp: pubDate.getTime()
          });
        });
      }
    });

    // 最新排最前
    combined.sort((a, b) => b.timestamp - a.timestamp);

    return res.status(200).json({ articles: combined });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
