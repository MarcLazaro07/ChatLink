function parseMediaUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');
    // YouTube
    if (host.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return { kind: 'video', provider: 'youtube', id, embed: `https://www.youtube.com/embed/${id}` };
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      if (id) return { kind: 'video', provider: 'youtube', id, embed: `https://www.youtube.com/embed/${id}` };
    }
    // Vimeo
    if (host.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return { kind: 'video', provider: 'vimeo', id, embed: `https://player.vimeo.com/video/${id}` };
    }
    // Spotify
    if (host.includes('spotify.com')) {
      const path = u.pathname;
      return { kind: 'audio', provider: 'spotify', embed: `https://open.spotify.com/embed${path}` };
    }
    // SoundCloud
    if (host.includes('soundcloud.com')) {
      return { kind: 'audio', provider: 'soundcloud', embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}` };
    }
    // Files
    if (/\.(mp3)(\?|$)/i.test(u.pathname)) return { kind: 'audio', provider: 'file', src: url };
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(u.pathname)) return { kind: 'video', provider: 'file', src: url };
    if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(u.pathname)) return { kind: 'image', provider: 'file', src: url };
    if (/\.(pdf)(\?|$)/i.test(u.pathname)) return { kind: 'pdf', provider: 'file', src: url };
  } catch {}
  return null;
}

export default parseMediaUrl;
