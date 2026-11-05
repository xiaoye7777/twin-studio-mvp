/*
 * DocumentStore：可编辑文档的唯一真相，撤销 / 重做的来源。
 *
 * - 文档是冻结的；修改只能 transaction(label, recipe)：recipe 改一个 Immer 草稿，得到新文档和正反两组补丁。
 * - 撤销 = 应用反向补丁，重做 = 应用正向补丁，任何修改都自动可撤销。
 * - coalesceKey 相同的连续事务合并成一步（拖动、滑块），seal() 结束合并。
 * - 没改的部分与旧文档共享引用，订阅者（SceneSync）据此只处理变化的部分。
 */
import { applyPatches, type Draft, enablePatches, freeze, type Objectish, type Patch, produceWithPatches } from 'immer'

/** How the document last changed; subscribers use it to tell edits from history navigation and loads. */
export type DocumentChangeOrigin = 'transaction' | 'undo' | 'redo' | 'reset'

export interface DocumentChange<D> {
  document: D
  previous: D
  /** Immer patches from `previous` to `document` (a single root replace for 'reset'). */
  patches: readonly Patch[]
  origin: DocumentChangeOrigin
  /** The history label of the transaction, undo or redo. */
  label?: string
}

export interface TransactionOptions {
  /**
   * Consecutive transactions with the same key merge into one undo step until `seal()` is called, so a
   * gizmo drag or a slider scrub becomes a single entry.
   */
  coalesceKey?: string
}

const UNREACHABLE = Symbol('unreachable')

interface HistoryEntry {
  label: string
  patches: Patch[]
  inversePatches: Patch[]
  coalesceKey?: string
  sealed: boolean
}

/**
 * The single source of truth for an editable document. Every change is a transaction recorded as Immer
 * patches, so undo and redo cover any edit without per-operation code. Documents are frozen: read them
 * freely, change them only through `transaction`.
 */
export class DocumentStore<D extends Objectish> {
  private current: D
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  /**
   * The top undo entry when last saved: null for the history-free starting state, UNREACHABLE once the saved
   * state has fallen off the history limit.
   */
  private savedAt: HistoryEntry | null | typeof UNREACHABLE = null
  private readonly listeners = new Set<(change: DocumentChange<D>) => void>()

  constructor(
    initial: D,
    private readonly historyLimit = 200,
  ) {
    // Called here rather than at module load so bundles that never edit documents can drop Immer.
    enablePatches()
    this.current = freeze(initial, true)
  }

  get document(): D {
    return this.current
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }
  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }
  /** True when the document differs from the last `markSaved()` (or the initial document). */
  get isDirty(): boolean {
    return (this.undoStack.at(-1) ?? null) !== this.savedAt
  }

  /**
   * Applies `recipe` to a draft of the document. Returns false (and records nothing) when the recipe made no
   * change. If the recipe throws, the document is left untouched and the error propagates.
   */
  transaction(label: string, recipe: (draft: Draft<D>) => void, options: TransactionOptions = {}): boolean {
    const [next, patches, inversePatches] = produceWithPatches(this.current, recipe)
    if (!patches.length) return false
    const top = this.undoStack.at(-1)
    const merge = options.coalesceKey !== undefined && top && !top.sealed && top.coalesceKey === options.coalesceKey
    if (merge) {
      top.patches.push(...patches)
      top.inversePatches = [...inversePatches, ...top.inversePatches]
    } else {
      this.undoStack.push({ label, patches, inversePatches, coalesceKey: options.coalesceKey, sealed: false })
      if (this.undoStack.length > this.historyLimit) this.dropOldest()
    }
    this.redoStack = []
    this.commit(next, patches, 'transaction', label)
    return true
  }

  /** Ends the current coalescing run (e.g. on pointer up): the next transaction starts a new undo step. */
  seal(): void {
    const top = this.undoStack.at(-1)
    if (top) top.sealed = true
  }

  undo(): boolean {
    const entry = this.undoStack.pop()
    if (!entry) return false
    entry.sealed = true
    this.redoStack.push(entry)
    this.commit(applyPatches(this.current, entry.inversePatches), entry.inversePatches, 'undo', entry.label)
    return true
  }

  redo(): boolean {
    const entry = this.redoStack.pop()
    if (!entry) return false
    this.undoStack.push(entry)
    this.commit(applyPatches(this.current, entry.patches), entry.patches, 'redo', entry.label)
    return true
  }

  /** Records the current state as saved; later edits make the store dirty again. */
  markSaved(): void {
    this.seal()
    this.savedAt = this.undoStack.at(-1) ?? null
  }

  /** Replaces the whole document (e.g. after loading) and clears history; the new document counts as saved. */
  reset(document: D): void {
    this.undoStack = []
    this.redoStack = []
    this.savedAt = null
    this.commit(freeze(document, true), [{ op: 'replace', path: [], value: document }], 'reset')
  }

  /** Calls `listener` after every change. Returns an unsubscribe function. */
  subscribe(listener: (change: DocumentChange<D>) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private dropOldest(): void {
    const dropped = this.undoStack.shift()
    // The state after the dropped entry becomes the new starting state.
    if (this.savedAt === null) this.savedAt = UNREACHABLE
    else if (this.savedAt === dropped) this.savedAt = null
  }

  private commit(next: D, patches: readonly Patch[], origin: DocumentChangeOrigin, label?: string): void {
    const previous = this.current
    this.current = next
    const change: DocumentChange<D> = { document: next, previous, patches, origin, label }
    for (const listener of [...this.listeners]) listener(change)
  }
}
