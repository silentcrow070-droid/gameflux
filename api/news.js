export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const allSources = [
    { name: "PlayStation", url: "https://blog.playstation.com/feed/", type: "rss", weight: 2 },
    { name: "Xbox Wire", url: "https://news.xbox.com/en-us/feed/", type: "rss", weight: 2 },
    { name: "Steam News", url: "https://store.steampowered.com/feeds/news.xml", type: "rss", weight: 2 },
    { name: "Nintendo", url: "https://www.nintendo.com/jp/topics/rss/index.xml", type: "rss", weight: 2 },
    { name: "IGN", url: "https://news.google.com/rss/search?q=site:ign.com+game+-phone+-tablet+-deals&hl=en-US&gl=US&ceid=US:en", type: "gnews", weight: 1 },
    { name: "巴哈姆特", url: "https://news.google.com/rss/search?q=site:gnn.gamer.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant", type: "gnews", weight: 1 },
    { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest", type: "rss", weight: 1 }
  ];

  try {
    const results = await Promise.allSettled(allSources.map(s => 
      fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
    ));

    let finalArticles = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const source = allSources[i];
        const rawItems = result.value.split('<item>').slice(1);
        
        rawItems.forEach(item => {
          let title = (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim();
          let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
          let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
          let content = item.match(/<content:encoded>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/s)?.[1] || "";
          
          if (source.type === "gnews") title = title.split(' - ')[0];

          // 挖掘 YouTube ID
          const fullText = desc + content;
          let videoId = "";
          const ytMatch = fullText.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (ytMatch) videoId = ytMatch[1];

          finalArticles.push({
            title, url: link, videoId, source: source.name,
            ts: new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]).getTime() || Date.now(),
            weight: source.weight
          });
        });
      }
    });

    finalArticles.sort((a, b) => b.weight - a.weight || b.ts - a.ts);
    res.status(200).json({ articles: finalArticles.slice(0, 30) });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
