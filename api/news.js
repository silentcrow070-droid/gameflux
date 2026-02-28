export default async function handler(req, res) {
  // 設定 CORS 與快取
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region } = req.query;

  // 國內媒體
  const twSources = [
    { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
    { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" }
  ];

  // 國外媒體
  const globalSources = [
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/news/" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
  ];

  let rssSources = [];
  if (region === 'tw') rssSources = twSources;
  else if (region === 'global') rssSources = globalSources;
  else rssSources = [...twSources, ...globalSources];

  try {
    const requests = rssSources.map(source => 
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`).then(r => r.json())
    );

    const results = await Promise.all(requests);
    let combined = [];

    results.forEach((data, index) => {
      if (data.status === 'ok') {
        data.items.forEach(item => {
          // --- 圖片抓取強化邏輯 ---
          let imageUrl = item.enclosure?.link || item.thumbnail || "";
          
          // 如果沒圖，從 description 內容中挖掘第一張 <img> 標籤
          if (!imageUrl && item.description) {
            const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) imageUrl = imgMatch[1];
          }
          
          // 針對巴哈姆特圖片網址的常見修正（確保抓到大圖）
          if (imageUrl && imageUrl.includes('gamer.com.tw')) {
            imageUrl = imageUrl.replace('p2.bahamut.com.tw/S/', 'p2.bahamut.com.tw/B/');
          }

          combined.push({
            title: item.title,
            url: item.link,
            image: imageUrl,
            source: rssSources[index].name,
            timestamp: new Date(item.pubDate).getTime(),
            time: item.pubDate.slice(5, 16)
          });
        });
      }
    });

    // 依時間由新到舊排序
    combined.sort((a, b) => b.timestamp - a.timestamp);

    return res.status(200).json({ articles: combined });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
