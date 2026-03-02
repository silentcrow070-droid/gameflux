export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  // 如果是請求背景圖片
  if (req.query.type === 'background') {
    try {
      const results = await Promise.allSettled(allSources.map(s => {
        const headers = { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };
        
        if (s.name === "巴哈姆特") {
          headers['Referer'] = 'https://www.gamer.com.tw/';
          headers['Accept'] = 'application/rss+xml, application/xml, text/xml';
        }
        
        return fetch(s.url, { headers }).then(r => r.text());
      }));

      let allImages = [];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayTime = yesterday.getTime();

      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const source = allSources[i];
          const rawItems = result.value.split('<item>').slice(1);
          
          rawItems.forEach(item => {
            let img = (item.match(/<media:content[^>]+url="([^">]+)"/i) || 
                       item.match(/<enclosure[^>]+url="([^">]+)"/i) ||
                       item.match(/<img[^>]+src="([^">]+?)"/i) ||
                       item.match(/<url>(.*?)<\/url>/i) ||
                       item.match(/<description>(?:<!\[CDATA\[)?.*?<img[^>]+src="([^">]+?)".*?(?:\]\]>)?<\/description>/i) || [])[1] || "";

            if (img) {
              const pubDate = new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]).getTime() || Date.now();
              // 只取前一日的新聞圖片
              if (pubDate >= yesterdayTime) {
                allImages.push({
                  image: img.replace(/&amp;/g, '&'),
                  source: source.name,
                  title: (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim()
                });
              }
            }
          });
        }
      });

      // 隨機選擇一張圖片
      if (allImages.length > 0) {
        const randomImage = allImages[Math.floor(Math.random() * allImages.length)];
        res.status(200).json(randomImage);
      } else {
        res.status(404).json({ error: 'No images found' });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  const allSources = [
    { name: "PlayStation", url: "https://blog.playstation.com/feed/", type: "rss" },
    { name: "Xbox Wire", url: "https://news.xbox.com/en-us/feed/", type: "rss" },
    { name: "Nintendo", url: "https://www.nintendo.com/jp/topics/rss/index.xml", type: "rss" },
    { name: "IGN", url: "https://feeds.feedburner.com/ign/all", type: "rss" },
    { name: "巴哈姆特", url: "https://www.gamer.com.tw/rss/gnn.xml", type: "rss" }
  ];

  // 封殺雜訊關鍵字
  const JUNK = [
    'SAMSUNG', 'GALAXY', 'IPHONE', 'SONOS', 'SOUNDBAR', 'DEALS', 'OFFER', 'SALE', 
    'PC', 'RTX', 'GPU', 'ALIENWARE', 'MONITOR', 'LAPTOP', 'DUSTER', 'KEYBOARD', 
    'MOUSE', 'HEADSET', 'PRICE', 'SAVE', 'DISCOUNT', 'LOWEST', 'DEAL', 'HARDWARE',
    'LEGO', 'APPLE TV', 'DISNEY', 'NETFLIX', 'HBO', 'PEACOCK', 'STREAMING', 'AMAZON PRIME'
  ];

  try {
    const results = await Promise.allSettled(allSources.map(s => {
      const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      };
      
      // 巴哈姆特特殊處理
      if (s.name === "巴哈姆特") {
        headers['Referer'] = 'https://www.gamer.com.tw/';
        headers['Accept'] = 'application/rss+xml, application/xml, text/xml';
      }
      
      return fetch(s.url, { headers }).then(r => r.text());
    }));

    let finalArticles = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const source = allSources[i];
        const rawItems = result.value.split('<item>').slice(1);
        
        rawItems.forEach(item => {
          let title = (item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "").trim();
          if (JUNK.some(k => title.toUpperCase().includes(k))) return;

          let link = (item.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
          let img = (item.match(/<media:content[^>]+url="([^">]+)"/i) || 
                     item.match(/<enclosure[^>]+url="([^">]+)"/i) ||
                     item.match(/<img[^>]+src="([^">]+?)"/i) ||
                     item.match(/<url>(.*?)<\/url>/i) ||
                     item.match(/<description>(?:<!\[CDATA\[)?.*?<img[^>]+src="([^">]+?)".*?(?:\]\]>)?<\/description>/i) || [])[1] || "";

          // 優化圖片解析
          if (source.name === "IGN" && img) img = img.split('?')[0].replace('/thumb/', '/article/'); 

          finalArticles.push({
            title, url: link, image: img, source: source.name,
            ts: new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]).getTime() || Date.now()
          });
        });
      }
    });

    finalArticles.sort((a, b) => b.ts - a.ts);
    res.status(200).json({ articles: finalArticles.slice(0, 42) });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
