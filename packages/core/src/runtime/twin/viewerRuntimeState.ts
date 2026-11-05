import { readonly } from 'vue'
import type { ViewerRuntimeState } from '../../contract/viewerContract'
import type { TwinRuntimeState } from './TwinDataRuntime'

/** Stable, live projection: no configuration or runtime mutation methods escape. */
export function createViewerRuntimeState(state: TwinRuntimeState): ViewerRuntimeState {
  return readonly({
    get projectId() {
      return state.projectId
    },
    get bindings() {
      return state.bindings
    },
    get runtimeValues() {
      return state.runtimeValues
    },
    get resolutionByBindingId() {
      return state.resolutionByBindingId
    },
    get bindingRevision() {
      return state.bindingRevision
    },
    get runtimeRevision() {
      return state.runtimeRevision
    },
    get resolutionRevision() {
      return state.resolutionRevision
    },
    get dataSourceType() {
      return state.dataSourceType
    },
    get dataSourceStatus() {
      return state.dataSourceStatus
    },
    get dataSourceMessageCount() {
      return state.dataSourceMessageCount
    },
    get dataSourceError() {
      return state.dataSourceError
    },
    get dataSourceStates() {
      return state.dataSourceStates
    },
    getRuntimeValue(bindingId: string, variableKey: string) {
      const value = state.getRuntimeValue(bindingId, variableKey)
      return value ? readonly(value) : null
    },
  })
}
