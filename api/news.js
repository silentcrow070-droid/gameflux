// api/news.js — 全球遊戲情報中心 (中英混合 + 主流媒體版)
export default async function handler(req, res) {
  // 允許跨域請求
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Vercel 邊緣快取 10 分鐘，減少對 GNews API 額度的消耗
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GNEWS_API_KEY not set in Vercel environment variables.' });
  }

  // 設定搜尋配置
  // 1. 中文：鎖定台灣 (tw)，過濾巴哈、IGN、4Gamers
  // 2. 英文：鎖定美國 (us)，過濾 IGN、GameSpot、PC Gamer、Eurogamer
  const configs = [
    { 
      lang: 'zh', 
      country: 'tw', 
      q: '(新作 OR 評測 OR 熱門) AND (IGN OR 巴哈姆特 OR 4Gamers OR 遊戲基地)' 
    },
    { 
      lang: 'en', 
      country: 'us', 
      q: '(New Release OR Review OR Trending) AND (IGN OR GameSpot OR PC Gamer OR Eurogamer)' 
    }
  ];

  try {
    // 同時執行中、英兩組 API 請求
    const requests = configs.map(conf => {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&country=${conf.country}&max=10&apikey=${apiKey}`;
      return fetch(url).then(async r => {
        const d = await r.json();
        if (!r.ok) return { error: d.errors || 'API limit reached' };
        return d;
      });
    });

    const results = await Promise.all(requests);
    
    let combinedArticles = [];

    results.forEach(data => {
      // 容錯檢查：確保該請求成功且有文章資料
      if (data && data.articles && Array.isArray(data.articles)) {
        data.articles.forEach(a => {
          combinedArticles.push({
            title: a.title || 'No Title',
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

    // 如果完全沒有抓到任何資料（可能是兩邊都報錯）
    if (combinedArticles.length === 0) {
      // 檢查是否有 API 報錯訊息
      const errorMsg = results.find(r => r.error)?.error || 'No news found';
      return res.status(500).json({ error: errorMsg });
    }

    // 依發布時間排序（最新的排在最前面）
    combinedArticles.sort((a, b) => b.timestamp - a.timestamp);

    // 回傳給前端
    return res.status(200).json({ articles: combinedArticles });

  } catch (err) {
    console.error('Server Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
}
