import type { RoleManifest } from '@agentableui/core'

export function validatePlan(
  manifest: RoleManifest,
  actions: string[]
): { valid: boolean; failedAt?: string; reason?: string } {
  let currentState = manifest.entrypoint

  for (const action of actions) {
    const state = manifest.states[currentState]
    if (!state) {
      return { valid: false, failedAt: action, reason: `State "${currentState}" not in manifest` }
    }
    const actionConfig = state.actions[action]
    if (!actionConfig) {
      return { valid: false, failedAt: action, reason: `Action "${action}" not available in state "${currentState}"` }
    }
    currentState = actionConfig.transitions ?? currentState
  }

  return { valid: true }
}
