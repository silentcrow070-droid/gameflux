// api/news.js — 同時抓取中英文主流媒體新聞
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  // 定義搜尋條件
  const configs = [
    { lang: 'zh', country: 'tw', q: '(新作 OR 評測 OR 熱門) AND (IGN OR 巴哈姆特 OR 4Gamers OR 遊戲基地)' },
    { lang: 'en', country: 'us', q: '(New Release OR Review OR Trending) AND (IGN OR GameSpot OR PC Gamer OR Eurogamer)' }
  ];

  try {
    // 同時執行兩個請求
    const requests = configs.map(conf => {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&country=${conf.country}&max=10&apikey=${apiKey}`;
      return fetch(url).then(r => r.json());
    });

    const results = await Promise.all(requests);
    
    // 合併並整理資料
    let combinedArticles = [];
    results.forEach(data => {
      if (data.articles) {
        data.articles.forEach(a => {
          combinedArticles.push({
            title: a.title,
            summary: a.description || '',
            url: a.url,
            image: a.image || null,
            source: a.source?.name || 'News',
            date: a.publishedAt?.slice(0, 10) || '',
            timestamp: new Date(a.publishedAt).getTime() // 用於排序
          });
        });
      });

    // 依時間排序（最新的在前）
    combinedArticles.sort((a, b) => b.timestamp - a.timestamp);

    return res.status(200).json({ articles: combinedArticles });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
