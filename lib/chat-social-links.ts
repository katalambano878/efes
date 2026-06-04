export type ChatSocialLink = {
  id: string;
  label: string;
  url: string;
  icon: string;
};

const DEFAULTS: Record<string, string> = {
  social_instagram: 'https://instagram.com/efescloset1',
  social_tiktok: 'https://tiktok.com/@MSs_____efe',
  social_snapchat: 'https://snapchat.com/add/feli_wiafe2021',
  social_whatsapp: '0272712187',
};

function whatsappUrl(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^233/, '').replace(/^0/, '');
  return digits ? `https://wa.me/233${digits}` : '';
}

function normalizeUrl(value: string, kind: 'whatsapp' | 'url'): string {
  const v = value.trim();
  if (!v) return '';
  if (kind === 'whatsapp') {
    if (v.startsWith('http')) return v;
    return whatsappUrl(v);
  }
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (v.startsWith('@')) return `https://instagram.com/${v.replace(/^@/, '')}`;
  return `https://${v}`;
}

/** True when the customer signals the conversation is finished. */
export function isConversationWrappingUp(userText: string): boolean {
  const t = userText.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(thanks?|thank you|thx|ty)\b/.test(t) ||
    /\b(bye|goodbye|good bye|see you|see ya|cheers)\b/.test(t) ||
    /\b(that'?s all|that is all|i'?m done|im done|all good|all set|nothing else|no more questions)\b/.test(t) ||
    /\b(got it|perfect|sorted|sorted out|no thanks|nah i'?m good)\b/.test(t) ||
    /^(ok|okay|cool|great|lovely|brilliant)[\s!.]*$/i.test(t)
  );
}

export async function fetchChatSocialLinks(supabase: any): Promise<ChatSocialLink[]> {
  const keys = [
    'social_instagram',
    'social_tiktok',
    'social_snapchat',
    'social_whatsapp',
    'social_facebook',
    'social_twitter',
  ];

  const map = new Map<string, string>();
  for (const k of keys) map.set(k, DEFAULTS[k] || '');

  try {
    const { data } = await supabase.from('site_settings').select('key, value').in('key', keys);
    for (const row of data || []) {
      const str = String(row.value ?? '').trim();
      if (str) map.set(row.key, str);
    }
  } catch {
    /* use defaults */
  }

  const links: ChatSocialLink[] = [];

  const ig = normalizeUrl(map.get('social_instagram') || '', 'url');
  if (ig) links.push({ id: 'instagram', label: 'Instagram', url: ig, icon: 'ri-instagram-line' });

  const tt = normalizeUrl(map.get('social_tiktok') || '', 'url');
  if (tt) links.push({ id: 'tiktok', label: 'TikTok', url: tt, icon: 'ri-tiktok-fill' });

  const sc = normalizeUrl(map.get('social_snapchat') || '', 'url');
  if (sc) links.push({ id: 'snapchat', label: 'Snapchat', url: sc, icon: 'ri-snapchat-line' });

  const wa = normalizeUrl(map.get('social_whatsapp') || '', 'whatsapp');
  if (wa) links.push({ id: 'whatsapp', label: 'WhatsApp', url: wa, icon: 'ri-whatsapp-line' });

  const fb = normalizeUrl(map.get('social_facebook') || '', 'url');
  if (fb) links.push({ id: 'facebook', label: 'Facebook', url: fb, icon: 'ri-facebook-fill' });

  const tw = normalizeUrl(map.get('social_twitter') || '', 'url');
  if (tw) links.push({ id: 'twitter', label: 'X / Twitter', url: tw, icon: 'ri-twitter-x-line' });

  return links;
}

export function appendSocialFollowHint(message: string): string {
  const base = message.trim() || "You're welcome! We're glad we could help.";
  const lower = base.toLowerCase();
  if (lower.includes('follow us') || lower.includes('social media') || lower.includes('stay connected')) {
    return base;
  }
  return `${base}\n\n**Stay connected** — follow us for new drops and updates (tap the links below).`;
}
