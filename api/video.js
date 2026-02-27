// api/video.js — 優化版
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800'); // 影片搜尋結果緩存 1 小時

  let { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query: q' });

  // 清洗標題：移除常見的新聞標題後綴或特殊符號
  const cleanQ = q.replace(/\|.*/, '').replace(/-.*/, '').replace(/【.*】/, '').trim();

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY not set' });

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanQ)}&type=video&maxResults=4&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message });
    }

    const videos = (data.items || []).map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle
    }));

    return res.status(200).json({ videos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
