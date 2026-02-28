export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { region, category, sort } = req.query;

  const sources = {
    tw: [
      { name: "4Gamers", url: "https://www.4gamers.com.tw/rss/latest" },
      { name: "UDN遊戲", url: "https://game.udn.com/rss/news/2003/2004" },
      { name: "ETtoday遊戲", url: "https://feeds.feedburner.com/ettoday/game" }
    ],
    global: [
      { name: "遊民星空", url: "https://www.gamersky.com/rssfeed/01.xml" },
      { name: "IGN", url: "https://feeds.feedburner.com/ign/all" },
      { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" }
    ]
  };

  const s2t = (s) => {
    const d = { '游':'遊','戏':'戲','电':'電','竞':'競','发':'發','机':'機','体':'體','后':'後','里':'裡','开':'開','关':'關' };
    return s.replace(/[游戏电竞发机体后里开关]/g, m => d[m] || m);
  };

  let selected = region === 'tw' ? sources.tw : (region === 'global' ? sources.global : [...sources.tw, ...sources.global]);

  try {
    const results = await Promise.allSettled(selected.map(s => 
      fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
    ));

    let articles = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const xml = result.value;
        const items = xml.split('<item>').slice(1);
        
        items.forEach(item => {
          let title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "";
          let link = item.match(/<link>(.*?)<\/link>/)?.[1];
          let desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1] || "";
          let encoded = item.match(/<content:encoded>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/s)?.[1] || "";
          let pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];

          // --- 核心改進：精準圖片選擇器 ---
          let img = "";
          // 1. 優先權 A：媒體定義的專屬封圖 (media:content 或 enclosure)
          const mediaMatch = item.match(/<(?:media:content|enclosure)[^>]+url="([^">]+)"/i);
          
          // 2. 優先權 B：從描述中掃描，並過濾雜訊
          let allImgTags = (desc + encoded).matchAll(/src="([^">]+?\.(?:jpg|jpeg|png|webp)[^">]*?)"/gi);
          let candidateImg = "";
          
          for (let match of allImgTags) {
            let url = match[1];
            // 排除清單：包含這些字眼的通常是廣告或小圖
            const noise = /logo|icon|avatar|pixel|track|share|fb|line|follow|ads|spacer/i.test(url);
            if (!noise) {
              candidateImg = url;
              break; // 抓到第一個「不是廣告」的圖就停止
            }
          }

          img = (mediaMatch ? mediaMatch[1] : candidateImg) || "";
          if (img && img.startsWith('//')) img = 'https:' + img;

          // 簡轉繁處理
          if (["遊民星空", "PC Gamer"].includes(selected[i].name)) {
            title = s2t(title);
            desc = s2t(desc);
          }

          if (title && link) {
            articles.push({
              title: title.trim(),
              url: link.trim(),
              image: img,
              source: selected[i].name,
              ts: new Date(pubDate).getTime() || Date.now(),
              time: pubDate ? pubDate.slice(5, 16) : "",
              desc: desc.replace(/<[^>]*>/g, '').slice(0, 100)
            });
          }
        });
      }
    });

    // 關鍵字過濾邏輯
    if (category && category !== 'all') {
      const keywords = {
        tv: ['PS5', 'Switch', 'Nintendo', 'Xbox', 'Console', '家機', '任天堂'],
        pc: ['PC', 'Steam', 'Epic', 'RTX', 'GPU', '電腦', '顯卡'],
        mobile: ['Mobile', 'iOS', 'Android', '手機', '手遊', 'iPhone'],
        esports: ['Esports', 'Tournament', '電競', '比賽', '選手', '聯賽', '戰隊']
      };
      const keys = keywords[category.toLowerCase()];
      articles = articles.filter(a => keys.some(k => (a.title + a.desc).toUpperCase().includes(k.toUpperCase())));
    }

    res.status(200).json({ articles: articles.sort((a, b) => b.ts - a.ts).slice(0, 45) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
