import { describe, it, expect } from 'vitest'
import { validatePlan } from '../src/plan-validator'
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
      actions: { search: { transitions: 'results' } },
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

describe('validatePlan', () => {
  it('validates a reachable plan', () => {
    expect(validatePlan(manifest, ['search', 'go-home'])).toEqual({ valid: true })
  })

  it('fails on unreachable action', () => {
    const result = validatePlan(manifest, ['go-home'])
    expect(result.valid).toBe(false)
    expect(result.failedAt).toBe('go-home')
  })

  it('validates empty plan', () => {
    expect(validatePlan(manifest, [])).toEqual({ valid: true })
  })
})
