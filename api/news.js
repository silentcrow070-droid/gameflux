export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region } = req.query;

  const twSources = [
    { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
    { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" }
  ];

  const globalSources = [
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/news/" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
  ];

  let selectedSources = region === 'tw' ? twSources : (region === 'global' ? globalSources : [...twSources, ...globalSources]);

  try {
    const requests = selectedSources.map(source => 
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`).then(r => r.json())
    );

    const results = await Promise.all(requests);
    
    let topPick = []; // 存放各站第一篇
    let others = [];  // 存放剩下的

    results.forEach((data, index) => {
      if (data.status === 'ok' && data.items.length > 0) {
        data.items.forEach((item, itemIndex) => {
          // --- 強化圖片挖掘 ---
          let imageUrl = item.enclosure?.link || item.thumbnail || "";
          if (!imageUrl && item.description) {
            const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) imageUrl = imgMatch[1];
          }

          // 修正巴哈姆特圖片：將 S (小圖) 強制轉為 B (大圖)
          if (imageUrl && imageUrl.includes('gamer.com.tw')) {
            imageUrl = imageUrl.replace('/S/', '/B/');
          }

          const article = {
            title: item.title,
            url: item.link,
            image: imageUrl,
            source: selectedSources[index].name,
            timestamp: new Date(item.pubDate).getTime(),
            time: item.pubDate.slice(5, 16)
          };

          if (itemIndex === 0) topPick.push(article); // 每個網站的第一篇
          else others.push(article);
        });
      }
    });

    // TopPick 按時間排，Others 按時間排
    topPick.sort((a, b) => b.timestamp - a.timestamp);
    others.sort((a, b) => b.timestamp - a.timestamp);

    // 回傳時，TopPick 會排在最前面，確保大看板是由不同網站組成的
    return res.status(200).json({ articles: [...topPick, ...others] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
