import { describe, it, expect } from 'vitest'
import { getStateGraph } from '../src/state-graph'
import type { RoleManifest } from '@agentableui/core'

const manifest: RoleManifest = {
  version: '1.0',
  versionHash: 'abc12345',
  name: 'test',
  baseUrl: 'https://example.com',
  entrypoint: 'home',
  role: 'public',
  states: {
    home: {
      route: '/',
      description: 'Home',
      actions: {
        search: { transitions: 'results' },
        refresh: {},
      },
    },
    results: {
      route: '/results',
      description: 'Results',
      actions: { 'go-home': { transitions: 'home' } },
    },
  },
  security: {
    publicActions: ['search', 'go-home', 'refresh'],
    authenticatedActions: [],
    rateLimit: { requests: 100, window: '1m', scope: 'per-key' },
  },
}

describe('getStateGraph', () => {
  it('returns correct nodes and edges', () => {
    const graph = getStateGraph(manifest)
    expect(graph.nodes).toEqual(['home', 'results'])
    expect(graph.edges).toContainEqual({ from: 'home', action: 'search', to: 'results' })
    expect(graph.edges).toContainEqual({ from: 'home', action: 'refresh', to: 'home' })
    expect(graph.edges).toContainEqual({ from: 'results', action: 'go-home', to: 'home' })
  })
})
