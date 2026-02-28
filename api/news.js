// api/news.js 完整代碼
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // 基礎 CORS 標頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, proxy } = req.query;

  // --- 新增：圖片代理邏輯 ---
  if (proxy) {
    try {
      // 後端發起請求，並偽裝 Referer 為巴哈官網
      const response = await fetch(decodeURIComponent(proxy), {
        headers: {
          'Referer': 'https://gnn.gamer.com.tw/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) throw new Error('Proxy failed');

      // 設定圖片回傳標頭
      res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      response.body.pipe(res); // 將圖片串流直接導向回應
      return;
    } catch (e) {
      return res.status(404).end();
    }
  }
  // -------------------------

  // 媒體來源定義
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
    
    let topPicksBySource = {}; // 存放每個站最新的新聞
    let others = [];

    results.forEach((data, index) => {
      if (data.status === 'ok' && data.items.length > 0) {
        const sourceName = selectedSources[index].name;

        data.items.forEach((item, itemIndex) => {
          // 強化圖片挖掘
          let imageUrl = item.enclosure?.link || item.thumbnail || "";
          if (!imageUrl && item.description) {
            const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) imageUrl = imgMatch[1];
          }

          // 如果是巴哈姆特的圖片，修正網址並加上代理前綴
          if (imageUrl && imageUrl.includes('gamer.com.tw')) {
            imageUrl = imageUrl.replace('/S/', '/B/');
            // 關鍵：將圖片網址轉為指向我們自己的代理接口
            imageUrl = `/api/news?proxy=${encodeURIComponent(imageUrl)}`; // 用 encode 確保網址安全
          }

          const article = {
            title: item.title,
            url: item.link,
            image: imageUrl,
            source: sourceName,
            timestamp: new Date(item.pubDate).getTime(),
            time: item.pubDate.slice(5, 16)
          };

          // --- 各選一篇邏輯：將每個站的第1篇存入分組 ---
          if (itemIndex === 0) {
            if (!topPicksBySource[sourceName]) topPicksBySource[sourceName] = article;
          } else {
            others.push(article);
          }
        });
      }
    });

    // 2. 將各選一篇的內容合併為 Top Picks，並按時間排
    let topPicksArray = Object.values(topPicksBySource).sort((a, b) => b.timestamp - a.timestamp);
    others.sort((a, b) => b.timestamp - a.timestamp);

    // 3. 將 Top Picks (精選區) 和 Others (列表區) 合併回傳
    return res.status(200).json({ articles: [...topPicksArray, ...others] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
