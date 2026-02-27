// api/news.js — 優化後的容錯版本
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  // 放寬關鍵字限制，並將媒體名稱移至後方以增加匹配機會
  const configs = [
    { 
      lang: 'zh', 
      country: 'tw', 
      q: '遊戲 AND (新作 OR 評測 OR 熱門)' // 移除特定的 site 限制，改用廣泛關鍵字
    },
    { 
      lang: 'en', 
      country: 'us', 
      q: 'gaming AND (new release OR review OR trending)' 
    }
  ];

  try {
    const requests = configs.map(conf => {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&country=${conf.country}&max=10&apikey=${apiKey}`;
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

    if (combined.length === 0) {
      // 如果還是沒東西，回傳自定義錯誤
      return res.status(404).json({ error: "No news found with current keywords." });
    }

    combined.sort((a, b) => b.timestamp - a.timestamp);
    return res.status(200).json({ articles: combined });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
