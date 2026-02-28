export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 設定 15 分鐘快取，既能保證即時性又不會頻繁請求媒體伺服器
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=450');

  // 精選 10 大遊戲媒體 RSS 來源
  const rssSources = [
    { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
    { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" },
    { name: "電玩宅速配", url: "https://tw.news.yahoo.com/rss/gaming" },
    { name: "IGN (ZH)", url: "https://cn.ign.com/news.xml" },
    { name: "IGN (EN)", url: "https://feeds.feedburner.com/ign/all" },
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/news/" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" },
    { name: "Eurogamer", url: "https://www.eurogamer.net/feed/news" },
    { name: "GamesRadar", url: "https://www.gamesradar.com/rss/" }
  ];

  try {
    const requests = rssSources.map(source => {
      // 透過 rss2json 轉換，此服務對一般用量是免費的
      const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;
      return fetch(proxyUrl).then(r => r.json()).catch(() => ({ status: 'error' }));
    });

    const results = await Promise.all(requests);
    let combined = [];

    results.forEach((data, index) => {
      if (data && data.status === 'ok') {
        data.items.slice(0, 8).forEach(item => {
          // 嘗試抓取圖片：優先找 enclosure，再找內容裡的 img 標籤
          let imageUrl = item.enclosure?.link || item.thumbnail || "";
          
          combined.push({
            title: item.title,
            url: item.link,
            image: imageUrl,
            source: rssSources[index].name,
            timestamp: new Date(item.pubDate).getTime(),
            time: item.pubDate.split(' ')[1] === undefined ? 
                  item.pubDate.slice(5, 16) : 
                  new Date(item.pubDate).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
          });
        });
      }
    });

    // 依時間由新到舊排序
    combined.sort((a, b) => b.timestamp - a.timestamp);

    return res.status(200).json({ articles: combined });

  } catch (err) {
    return res.status(500).json({ error: "RSS 聚合失敗", detail: err.message });
  }
}
