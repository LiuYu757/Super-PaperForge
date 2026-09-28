import { describe, it, expect } from 'vitest';
import { assertPublicGitRemote } from '@/lib/git-remote-guard';

describe('assertPublicGitRemote — IP literals', () => {
  it.each([
    ['http://127.0.0.1/g.git', 'loopback'],
    ['http://10.0.0.1/g.git', 'RFC1918 10/8'],
    ['http://192.168.1.1/g.git', 'RFC1918 192.168/16'],
    ['http://172.16.0.1/g.git', 'RFC1918 172.16/12 lower'],
    ['http://172.31.255.254/g.git', 'RFC1918 172.16/12 upper'],
    ['http://169.254.169.254/g.git', 'AWS / GCP metadata 169.254/16'],
    ['http://0.0.0.0/g.git', 'wildcard 0/8'],
    ['http://100.64.0.1/g.git', 'CGNAT 100.64/10'],
    ['http://198.18.0.1/g.git', 'benchmarking 198.18/15'],
    ['http://224.0.0.1/g.git', 'multicast 224/4'],
  ])('blocks IPv4 %s (%s)', async (url) => {
    await expect(assertPublicGitRemote(url)).rejects.toThrow(/non-public/i);
  });

  it.each([
    ['http://[::1]/g.git', 'IPv6 loopback'],
    ['http://[fe80::1]/g.git', 'IPv6 link-local'],
    ['http://[fc00::1]/g.git', 'IPv6 ULA'],
    ['http://[fd00::1]/g.git', 'IPv6 ULA fd'],
    ['http://[ff02::1]/g.git', 'IPv6 multicast'],
    ['http://[::ffff:127.0.0.1]/g.git', 'IPv4-mapped IPv6 loopback'],
    ['http://[::ffff:10.0.0.1]/g.git', 'IPv4-mapped IPv6 RFC1918'],
  ])('blocks IPv6 %s (%s)', async (url) => {
    await expect(assertPublicGitRemote(url)).rejects.toThrow(/non-public/i);
  });

  it.each([
    ['http://1.1.1.1/g.git', 'Cloudflare public'],
    ['http://8.8.8.8/g.git', 'Google public'],
    ['https://93.184.216.34/g.git', 'example.com public IP'],
  ])('allows public IPv4 %s (%s)', async (url) => {
    await expect(assertPublicGitRemote(url)).resolves.toBeUndefined();
  });
});

describe('assertPublicGitRemote — URL shape', () => {
  it('rejects malformed URLs', async () => {
    await expect(assertPublicGitRemote('not a url')).rejects.toThrow(/Invalid/i);
  });

  it('rejects URLs without a hostname', async () => {
    await expect(assertPublicGitRemote('http://')).rejects.toThrow();
  });

  it('rejects hostnames that fail to resolve', async () => {
    // .invalid is reserved by RFC 2606 and must never resolve.
    await expect(
      assertPublicGitRemote('https://nonexistent.example.invalid/g.git'),
    ).rejects.toThrow(/resolve/i);
  });
});
