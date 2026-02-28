export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const allSources = [
    { name: "PlayStation", url: "https://blog.playstation.com/feed/", type: "rss", weight: 3 },
    { name: "Xbox Wire", url: "https://news.xbox.com/en-us/feed/", type: "rss", weight: 3 },
    { name: "Nintendo", url: "https://www.nintendo.com/jp/topics/rss/index.xml", type: "rss", weight: 3 },
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all", type: "rss", weight: 2 },
    { name: "巴哈姆特", url: "https://news.google.com/rss/search?q=site:gnn.gamer.com.tw&hl=zh-TW&gl=TW&ceid=TW:zh-Hant", type: "gnews", weight: 1 }
  ];

  // --- 暴力過濾清單：封殺所有硬體與促銷雜訊 ---
  const JUNK = [
    'SAMSUNG', 'GALAXY', 'IPHONE', 'SONOS', 'SOUNDBAR', 'DEALS', 'OFFER', 'SALE', 
    'PC', 'RTX', 'GPU', 'ALIENWARE', 'MONITOR', 'LAPTOP', 'DUSTER', 'KEYBOARD', 
    'MOUSE', 'HEADSET', 'PRICE', 'SAVE', 'DISCOUNT', 'LOWEST', 'DEAL', 'HARDWARE'
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
          
          // 執行嚴格過濾邏輯
          if (JUNK.some(k => title.toUpperCase().includes(k))) return;

          let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
          let img = (item.match(/<media:content[^>]+url="([^">]+)"/i) || 
                     item.match(/<enclosure[^>]+url="([^">]+)"/i) ||
                     item.match(/<img[^>]+src="([^">]+?)"/i) || [])[1] || "";

          // IGN 圖片路徑優化
          if (source.name === "IGN" && img) {
            img = img.split('?')[0].replace('/thumb/', '/article/'); 
          }

          finalArticles.push({
            title, url: link, image: img, source: source.name,
            ts: new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]).getTime() || Date.now(),
            weight: source.weight
          });
        });
      }
    });

    finalArticles.sort((a, b) => b.weight - a.weight || b.ts - a.ts);
    res.status(200).json({ articles: finalArticles.slice(0, 40) });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
