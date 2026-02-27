export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GNEWS_API_KEY not set' });

  // 定義這 10 大網站的網域關鍵字（這是最準確的抓取邏輯）
  const whiteList = [
    'gamer.com.tw', '4gamers.com.tw', 'gamebase.com.tw', 'ign.com', 
    'gamespot.com', 'pcgamer.com', 'eurogamer.net', 'gamesradar.com'
  ];

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - (72 * 60 * 60 * 1000));
  const fromDate = threeDaysAgo.toISOString().split('.')[0] + 'Z'; 

  const configs = [
    { lang: 'zh', country: 'tw', q: '遊戲' }, // 抓取台灣所有遊戲新聞
    { lang: 'en', q: 'gaming' }               // 抓取全球所有遊戲新聞
  ];

  try {
    const requests = configs.map(conf => {
      // 增加 max 數量至 50，確保過濾後還有足夠文章
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(conf.q)}&lang=${conf.lang}&from=${fromDate}&max=50&apikey=${apiKey}${conf.country ? `&country=${conf.country}` : ''}`;
      return fetch(url).then(r => r.json());
    });

    const results = await Promise.all(requests);
    let filteredArticles = [];

    results.forEach(data => {
      if (data && data.articles) {
        data.articles.forEach(a => {
          // 檢查文章的網址 (url) 是否包含在我們的 10 大白名單中
          const isFromTop10 = whiteList.some(domain => a.url.toLowerCase().includes(domain));
          
          if (isFromTop10) {
            const pubDate = new Date(a.publishedAt);
            filteredArticles.push({
              title: a.title,
              url: a.url,
              image: a.image || null,
              source: a.source?.name || 'News',
              time: (pubDate.getMonth() + 1) + '/' + pubDate.getDate() + ' ' + 
                    pubDate.getHours().toString().padStart(2, '0') + ':' + 
                    pubDate.getMinutes().toString().padStart(2, '0'),
              timestamp: pubDate.getTime()
            });
          }
        });
      }
    });

    // 依時間排序
    filteredArticles.sort((a, b) => b.timestamp - a.timestamp);

    // 如果過濾後太少，則補一些熱門新聞進去，避免網頁空白
    if (filteredArticles.length === 0) {
        return res.status(200).json({ articles: results[0]?.articles?.slice(0, 10) || [] });
    }

    return res.status(200).json({ articles: filteredArticles });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
