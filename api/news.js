export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=450');

  const rssSources = [
    { name: "巴哈姆特", url: "https://gnn.gamer.com.tw/rss.xml" },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
    { name: "遊戲基地", url: "https://www.gamebase.com.tw/news/gb_news.xml" },
    { name: "IGN", url: "https://cn.ign.com/news.xml" },
    { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
  ];

  try {
    const requests = rssSources.map(source => 
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`).then(r => r.json())
    );

    const results = await Promise.all(requests);
    let combined = [];

    results.forEach((data, index) => {
      if (data.status === 'ok') {
        data.items.forEach(item => {
          combined.push({
            title: item.title,
            url: item.link,
            image: item.enclosure?.link || item.thumbnail || "",
            source: rssSources[index].name,
            timestamp: new Date(item.pubDate).getTime(),
            date: item.pubDate.slice(5, 16)
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
