import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentableClient } from '../src/client'
import type { RoleManifest } from '@agentableui/core'

const mockManifest: RoleManifest = {
  version: '1.0',
  versionHash: 'abc12345',
  name: 'test-store',
  baseUrl: 'https://store.com',
  entrypoint: 'home',
  role: 'public',
  states: {
    home: {
      route: '/',
      description: 'Home',
      actions: {
        search: { transitions: 'results', params: { query: { type: 'string', required: true } } },
      },
    },
    results: {
      route: '/results',
      description: 'Results',
      actions: { 'go-home': { transitions: 'home' } },
    },
  },
  security: {
    publicActions: ['search', 'go-home'],
    authenticatedActions: [],
    rateLimit: { requests: 100, window: '1m', scope: 'per-key' },
  },
}

const mockMeta = {
  agentable: '1.0',
  name: 'test-store',
  manifests: { public: '/agentable/manifest/public', admin: '/agentable/manifest/admin' },
  execute: '/agentable/execute',
  conditions: '/agentable/conditions',
}

function mockResponse(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  }
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('AgentableClient', () => {
  describe('discover()', () => {
    it('fetches meta-manifest then role manifest and sets currentState', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      const manifest = await client.discover()

      expect(manifest.name).toBe('test-store')
      expect(client.currentState?.name).toBe('home')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
      const client = new AgentableClient('https://store.com')
      await expect(client.discover()).rejects.toThrow('Network error')
    })

    it('throws with available roles when role not found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(mockResponse(200, mockMeta)))
      const client = new AgentableClient('https://store.com', { role: 'nonexistent' })
      await expect(client.discover()).rejects.toThrow(/Available roles.*public.*admin/)
    })

    it('passes API key header when provided', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com', { apiKey: 'test-key' })
      await client.discover()

      // Second call (role manifest) should have Authorization header
      const secondCall = mockFetch.mock.calls[1]
      expect(secondCall[1].headers['Authorization']).toBe('Bearer test-key')
    })
  })

  describe('execute()', () => {
    it('throws if called before discover()', async () => {
      const client = new AgentableClient('https://store.com')
      await expect(client.execute('search', { query: 'shoes' })).rejects.toThrow(/discover/)
    })

    it('sends correct POST body', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(200, { status: 'ok', state: 'results', data: {} }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      await client.execute('search', { query: 'shoes' })

      const executeCall = mockFetch.mock.calls[2]
      const body = JSON.parse(executeCall[1].body)
      expect(body).toEqual({ action: 'search', params: { query: 'shoes' }, currentState: 'home' })
    })

    it('sends API key in Authorization header', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(200, { status: 'ok', state: 'results', data: {} }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com', { apiKey: 'my-key' })
      await client.discover()
      await client.execute('search', { query: 'shoes' })

      const headers = mockFetch.mock.calls[2][1].headers
      expect(headers['Authorization']).toBe('Bearer my-key')
    })

    it('updates currentState on ok response', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(200, { status: 'ok', state: 'results', data: {} }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      expect(client.currentState?.name).toBe('home')

      await client.execute('search', { query: 'shoes' })
      expect(client.currentState?.name).toBe('results')
    })

    it('updates currentState on redirect response and stores returnTo', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(200, { status: 'redirect', state: 'results', reason: 'test', returnTo: 'home' }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      const result = await client.execute('search', { query: 'shoes' })

      expect(result.status).toBe('redirect')
      expect(client.currentState?.name).toBe('results')
    })

    it('does NOT update currentState on error response', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(422, { status: 'error', state: 'home', error: { code: 'FAIL', message: 'failed' } }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      await client.execute('search', { query: 'shoes' })
      expect(client.currentState?.name).toBe('home')
    })

    it('does NOT update currentState on unavailable response', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(409, { status: 'unavailable', state: 'home', condition: 'test', message: 'nope' }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      await client.execute('search', { query: 'shoes' })
      expect(client.currentState?.name).toBe('home')
    })

    it('does NOT update currentState on unauthorized response', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(401, { status: 'unauthorized', message: 'no key' }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      await client.execute('search', { query: 'shoes' })
      expect(client.currentState?.name).toBe('home')
    })

    it('does NOT update currentState on rate-limited response', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(429, { status: 'rate-limited', retryAfter: 30 }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      await client.execute('search', { query: 'shoes' })
      expect(client.currentState?.name).toBe('home')
    })

    it('does not update currentState on network error', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockRejectedValueOnce(new Error('Network failed'))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      await expect(client.execute('search')).rejects.toThrow()
      expect(client.currentState?.name).toBe('home')
    })

    it('throws on unknown response state for ok response', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(200, { status: 'ok', state: 'nonexistent', data: {} }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      await expect(client.execute('search', { query: 'shoes' })).rejects.toThrow(/unknown state/)
    })

    it('does NOT throw for error response with unknown state', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(422, { status: 'error', state: 'whatever', error: { code: 'X', message: 'y' } }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      // Should NOT throw - error responses don't update state
      const result = await client.execute('search', { query: 'shoes' })
      expect(result.status).toBe('error')
      expect(client.currentState?.name).toBe('home')
    })
  })

  describe('checkConditions()', () => {
    it('throws if called before discover()', async () => {
      const client = new AgentableClient('https://store.com')
      await expect(client.checkConditions()).rejects.toThrow(/discover/)
    })

    it('returns parsed conditions response', async () => {
      const conditionsResp = { conditions: { 'cart-empty': { met: true, description: 'Cart is empty' } } }
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(200, conditionsResp))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com')
      await client.discover()
      const result = await client.checkConditions()
      expect(result.conditions['cart-empty'].met).toBe(true)
    })

    it('sends API key header', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, mockMeta))
        .mockResolvedValueOnce(mockResponse(200, mockManifest, { etag: '"v1"' }))
        .mockResolvedValueOnce(mockResponse(200, { conditions: {} }))
      vi.stubGlobal('fetch', mockFetch)

      const client = new AgentableClient('https://store.com', { apiKey: 'my-key' })
      await client.discover()
      await client.checkConditions()

      const headers = mockFetch.mock.calls[2][1].headers
      expect(headers['Authorization']).toBe('Bearer my-key')
    })
  })

  describe('timeout', () => {
    it('passes abort signal to fetch calls', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts?: any) => {
        expect(opts?.signal).toBeDefined()
        throw new DOMException('The operation was aborted', 'AbortError')
      }))

      const client = new AgentableClient('https://store.com', { timeout: 100 })
      await expect(client.discover()).rejects.toThrow()
    })
  })
})
