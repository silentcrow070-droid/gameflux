export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region } = req.query; // 取得前端傳來的 region 參數

  // 1. 定義媒體清單與分類
  const twSources = [
    { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
    { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" },
    { name: "電玩宅速配", url: "https://tw.news.yahoo.com/rss/gaming" }
  ];

  const globalSources = [
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
    { name: "GameSpot", url: "https://www.gamespot.com/feeds/news/" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" },
    { name: "Eurogamer", url: "https://www.eurogamer.net/feed/news" }
  ];

  // 根據選擇決定抓取對象，預設抓全部
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
        data.items.slice(0, 10).forEach(item => {
          combined.push({
            title: item.title,
            url: item.link,
            image: item.enclosure?.link || item.thumbnail || "",
            source: rssSources[index].name,
            timestamp: new Date(item.pubDate).getTime(),
            time: item.pubDate.slice(5, 16)
          });
        });
      }
    });

    combined.sort((a, b) => b.timestamp - a.timestamp);
    return res.status(200).json({ articles: combined });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
