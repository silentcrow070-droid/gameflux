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

  const JUNK = ['SAMSUNG', 'GALAXY', 'IPHONE', 'SONOS', 'SOUNDBAR', 'DEALS', 'MOBILE', 'T-MOBILE', 'OFFER', 'SALE'];

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
          if (JUNK.some(k => title.toUpperCase().includes(k))) return;

          let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
          
          // --- 圖片深度抓取與淨化 ---
          let img = (item.match(/<media:content[^>]+url="([^">]+)"/i) || 
                     item.match(/<enclosure[^>]+url="([^">]+)"/i) ||
                     item.match(/<img[^>]+src="([^">]+?)"/i) || [])[1] || "";

          if (source.name === "IGN" && img) {
            // 破除 IGN 縮圖限制，還原為原始高清路徑
            img = img.split('?')[0]; 
            img = img.replace('/thumb/', '/article/'); 
          }
          
          if (source.name === "巴哈姆特" && img.includes('img.news.google.com')) img = "";

          finalArticles.push({
            title, url: link, image: img, source: source.name,
            ts: new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]).getTime() || Date.now(),
            weight: source.weight
          });
        });
      }
    });

    // 先依權重排序（官媒優先），再依時間排序
    finalArticles.sort((a, b) => b.weight - a.weight || b.ts - a.ts);
    res.status(200).json({ articles: finalArticles.slice(0, 36) });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
