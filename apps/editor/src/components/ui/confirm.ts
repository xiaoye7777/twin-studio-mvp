import { ElMessageBox } from 'element-plus'

/**
 * 弹出确认框。点确认返回 true，点取消或关闭返回 false。
 *
 *   if (!(await confirmAction(`删除「${name}」？`, { title: '删除大屏', confirm: '删除', danger: true }))) return
 */
export async function confirmAction(
  message: string,
  options: { title: string; confirm?: string; danger?: boolean },
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, options.title, {
      type: options.danger ? 'warning' : undefined,
      customClass: 'studio-dialog',
      confirmButtonText: options.confirm ?? '确定',
      cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
}
