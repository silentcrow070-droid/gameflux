// api/news.js — 從 GNews API 抓取遊戲新聞
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { lang = 'zh' } = req.query;
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GNEWS_API_KEY not set' });
  }

  // 依語言設定搜尋關鍵字與語系
  const isZh = lang === 'zh';
  const query = isZh ? '遊戲 OR 電競 OR Nintendo OR PlayStation OR Xbox' : 'gaming OR esports OR Nintendo OR PlayStation OR Xbox';
  const language = isZh ? 'zh' : 'en';

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=${language}&country=tw&max=10&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.articles) {
      return res.status(500).json({ error: data.errors || 'GNews error' });
    }

    // 整理格式傳給前端
    const articles = data.articles.map((a, i) => ({
      id: i + 1,
      title: a.title,
      summary: a.description || '',
      url: a.url,
      image: a.image || null,
      source: a.source?.name || 'News',
      date: a.publishedAt?.slice(0, 10) || '',
      searchQuery: a.title, // 給 YouTube 搜尋用
    }));

    return res.status(200).json({ articles });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
