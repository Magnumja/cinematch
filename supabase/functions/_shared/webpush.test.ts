import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, encryptPayload, isAllowedEndpoint, MAX_PAYLOAD_BYTES, sendWebPush, vapidAuthorization } from './webpush.ts';

const enc = new TextEncoder();

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array, len: number) {
  return (await hmac(await hmac(salt, ikm), new Uint8Array([...info, 1]))).slice(0, len);
}

// Lado do navegador (RFC 8291), escrito à parte para conferir a cifragem de ponta a ponta.
async function decrypt(body: Uint8Array, receiver: CryptoKeyPair, auth: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const senderPublic = body.slice(21, 21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey));
  const senderKey = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, receiver.privateKey, 256));
  const ikm = await hkdf(auth, shared, new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...senderPublic]), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const record = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)));
  expect(record.at(-1)).toBe(2);
  return new TextDecoder().decode(record.slice(0, -1));
}

async function receiver() {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  return { keys, auth, target: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh, auth: b64urlEncode(auth) } };
}

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  return { pair, vapid: { publicKey, privateKey: jwk.d!, subject: 'mailto:teste@cineou.local' } };
}

describe('webpush', () => {
  it('base64url ida e volta', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65));
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes);
    expect(b64urlEncode(new Uint8Array([251, 255]))).toBe('-_8');
  });

  it('cifra em aes128gcm que o navegador consegue abrir', async () => {
    const r = await receiver();
    const message = JSON.stringify({ title: 'Seu filme da semana', body: 'Amélie — ação ✓' });
    const body = await encryptPayload(enc.encode(message), r.target);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(await decrypt(body, r.keys, r.auth)).toBe(message);
  });

  it('recusa conteúdo acima do limite dos serviços de push', async () => {
    const r = await receiver();
    await expect(encryptPayload(new Uint8Array(MAX_PAYLOAD_BYTES + 1), r.target)).rejects.toThrow();
  });

  it('assina o VAPID com ES256 e o público do serviço de push', async () => {
    const { pair, vapid } = await vapidKeys();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, 1_000_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(vapid.publicKey);
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(m[2]!)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_000_000 + 12 * 3600, sub: vapid.subject });
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlDecode(m[3]!), enc.encode(`${m[1]}.${m[2]}`));
    expect(valid).toBe(true);
  });

  it('aceita só serviços de push conhecidos', () => {
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isAllowedEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false);
    expect(isAllowedEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isAllowedEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isAllowedEndpoint('não é url')).toBe(false);
  });

  it('envia com os cabeçalhos do protocolo e marca inscrições expiradas', async () => {
    const r = await receiver();
    const { vapid } = await vapidKeys();
    const calls: RequestInit[] = [];
    const reply = (status: number) => (async (_url: unknown, init?: RequestInit) => {
      calls.push(init!);
      return new Response(null, { status });
    }) as typeof fetch;

    expect(await sendWebPush(r.target, { title: 'x' }, vapid, { topic: 'scheduled', fetchImpl: reply(201) })).toEqual({ ok: true, status: 201 });
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.TTL).toBe('86400');
    expect(headers.Topic).toBe('scheduled');
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(await decrypt(calls[0]!.body as Uint8Array, r.keys, r.auth)).toBe('{"title":"x"}');

    expect(await sendWebPush(r.target, {}, vapid, { fetchImpl: reply(410) })).toEqual({ ok: false, status: 410, gone: true });
    expect(await sendWebPush(r.target, {}, vapid, { fetchImpl: reply(429) })).toEqual({ ok: false, status: 429, gone: false });
  });

  it('não faz requisição para endpoint fora da lista', async () => {
    const r = await receiver();
    const { vapid } = await vapidKeys();
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const out = await sendWebPush({ ...r.target, endpoint: 'https://example.com/x' }, {}, vapid, { fetchImpl: spy });
    expect(out).toEqual({ ok: false, status: 0, gone: true });
    expect(called).toBe(false);
  });
});
