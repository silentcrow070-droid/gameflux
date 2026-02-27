// api/news.js — 優化版
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 加入快取機制：Vercel 會緩存結果 10 分鐘，減少消耗 API 次數
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { lang = 'zh' } = req.query;
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GNEWS_API_KEY not set' });
  }

  const isZh = lang === 'zh';
  const query = isZh ? '遊戲 OR 電競 OR Nintendo OR PlayStation OR Xbox' : 'gaming OR esports OR Nintendo OR PlayStation OR Xbox';
  
  // 動態調整國家：中文對應台灣(tw)，英文對應美國(us)
  const country = isZh ? 'tw' : 'us'; 
  const language = isZh ? 'zh' : 'en';

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=${language}&country=${country}&max=12&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.articles) {
      return res.status(500).json({ error: data.errors || 'GNews error' });
    }

    const articles = data.articles.map((a, i) => ({
      id: i + 1,
      title: a.title,
      summary: a.description || '',
      url: a.url,
      image: a.image || null,
      source: a.source?.name || 'News',
      date: a.publishedAt?.slice(0, 10) || '',
    }));

    return res.status(200).json({ articles });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
