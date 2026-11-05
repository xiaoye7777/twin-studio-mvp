import type { SceneDocument } from '../../domain/scene'

export interface SceneRepository {
  save(document: SceneDocument): Promise<void>
  load(projectId: string): Promise<SceneDocument | null>
}
