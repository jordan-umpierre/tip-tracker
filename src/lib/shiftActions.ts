export async function deleteShiftWithFeedback(
  shiftId: string,
  deleteById: (id: string) => Promise<void>,
  onDeleted: () => void,
  onFailure: (cause: unknown) => void
): Promise<void> {
  try {
    await deleteById(shiftId);
    onDeleted();
  } catch (cause) {
    onFailure(cause);
  }
}
