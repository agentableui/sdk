import type { RoleManifest } from '@agentableui/core'

export interface StateGraph {
  nodes: string[]
  edges: { from: string; action: string; to: string }[]
}

export function getStateGraph(manifest: RoleManifest): StateGraph {
  const nodes = Object.keys(manifest.states)
  const edges: StateGraph['edges'] = []

  for (const [stateName, state] of Object.entries(manifest.states)) {
    for (const [actionName, action] of Object.entries(state.actions)) {
      const to = action.transitions ?? stateName
      edges.push({ from: stateName, action: actionName, to })
    }
  }

  return { nodes, edges }
}
