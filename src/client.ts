import type { RoleManifest, ManifestAction, ExecuteResponse, ConditionsResponse } from '@agentableui/core'
import { fetchMetaManifest, fetchRoleManifest } from './discovery'
import { getStateGraph, type StateGraph } from './state-graph'
import { validatePlan as validatePlanFn } from './plan-validator'

export class AgentableClient {
  private baseUrl: string
  private apiKey?: string
  private role: string
  private etag?: string
  private storedReturnTo?: string
  private executeUrl?: string
  private conditionsUrl?: string

  currentState: { name: string; actions: Record<string, ManifestAction> } | null = null
  manifest: RoleManifest | null = null

  constructor(baseUrl: string, options?: { apiKey?: string; role?: string }) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = options?.apiKey
    this.role = options?.role ?? 'public'
  }

  async discover(): Promise<RoleManifest> {
    const meta = await fetchMetaManifest(this.baseUrl)
    const manifestPath = meta.manifests[this.role]
    if (!manifestPath) {
      throw new Error(`Role "${this.role}" not found in meta-manifest`)
    }

    this.executeUrl = `${this.baseUrl}${meta.execute}`
    this.conditionsUrl = `${this.baseUrl}${meta.conditions}`

    const result = await fetchRoleManifest(this.baseUrl, manifestPath, this.apiKey, this.etag)
    if (result) {
      this.manifest = result.manifest
      this.etag = result.etag
    }

    if (!this.manifest) {
      throw new Error('No manifest available')
    }

    const entryState = this.manifest.states[this.manifest.entrypoint]
    if (entryState) {
      this.currentState = { name: this.manifest.entrypoint, actions: entryState.actions }
    }

    return this.manifest
  }

  async execute(action: string, params?: Record<string, unknown>): Promise<ExecuteResponse> {
    if (!this.currentState || !this.executeUrl) {
      throw new Error('Must call discover() before execute()')
    }

    const body: Record<string, unknown> = {
      action,
      params: params ?? {},
      currentState: this.currentState.name,
    }

    if (this.storedReturnTo) {
      body.returnTo = this.storedReturnTo
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

    const res = await fetch(this.executeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const response: ExecuteResponse = await res.json()

    // Clear returnTo after use
    this.storedReturnTo = undefined

    // Update state based on response
    if (response.status === 'ok' || response.status === 'redirect') {
      if (response.status === 'redirect') {
        this.storedReturnTo = response.returnTo
      }
      const newState = this.manifest?.states[response.state]
      if (newState) {
        this.currentState = { name: response.state, actions: newState.actions }
      }
    }

    return response
  }

  async checkConditions(): Promise<ConditionsResponse> {
    if (!this.conditionsUrl) {
      throw new Error('Must call discover() before checkConditions()')
    }
    const headers: Record<string, string> = {}
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

    const res = await fetch(this.conditionsUrl, { headers })
    if (!res.ok) throw new Error(`Failed to check conditions: ${res.status}`)
    return res.json()
  }

  getStateGraph(): StateGraph {
    if (!this.manifest) throw new Error('Must call discover() first')
    return getStateGraph(this.manifest)
  }

  validatePlan(actions: string[]): { valid: boolean; failedAt?: string; reason?: string } {
    if (!this.manifest) throw new Error('Must call discover() first')
    return validatePlanFn(this.manifest, actions)
  }
}
