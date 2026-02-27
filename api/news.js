export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 強制 Vercel 快取 1 小時，極大化節省額度
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  // 合併關鍵字：同時搜尋中英文內容
  const query = '遊戲 OR gaming OR 巴哈姆特 OR IGN OR GameSpot';

  try {
    // 每次只發送一個請求
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=zh&max=20&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        // 如果是因為額度滿了，回傳友善提示
        if (response.status === 403) return res.status(200).json({ articles: [], message: "今日 API 額度已用盡，請明早 8 點再試。" });
        return res.status(response.status).json({ error: "API Error" });
    }

    const articles = (data.articles || []).map(a => {
      const pubDate = new Date(a.publishedAt);
      return {
        title: a.title,
        url: a.url,
        image: a.image,
        source: a.source.name,
        time: (pubDate.getMonth() + 1) + '/' + pubDate.getDate() + ' ' + 
              pubDate.getHours().toString().padStart(2, '0') + ':' + 
              pubDate.getMinutes().toString().padStart(2, '0')
      };
    });

    return res.status(200).json({ articles });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
