import crypto from 'node:crypto';

export interface LivekitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function livekitConfig(): LivekitConfig | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Mints a LiveKit access token (HS256 JWT) without extra dependencies. */
export function createLivekitToken(options: {
  identity: string;
  name: string;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData?: boolean;
  ttlSeconds?: number;
}): { token: string; url: string; room: string; expiresIn: number } {
  const config = livekitConfig();
  if (!config) throw new Error('LiveKit is not configured');
  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = options.ttlSeconds ?? 3 * 60 * 60;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    exp: nowSec + ttl,
    iss: config.apiKey,
    sub: options.identity,
    nbf: nowSec - 10,
    name: options.name,
    video: {
      room: options.room,
      roomJoin: true,
      canPublish: options.canPublish,
      canSubscribe: options.canSubscribe,
      canPublishData: options.canPublishData ?? true,
    },
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', config.apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  return {
    token: `${encodedHeader}.${encodedPayload}.${base64url(signature)}`,
    url: config.url,
    room: options.room,
    expiresIn: ttl,
  };
}

export function livekitStatus() {
  const config = livekitConfig();
  return {
    configured: Boolean(config),
    url: config ? config.url.replace(/^wss?:\/\//, '') : null,
  };
}
