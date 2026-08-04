// Tells a user backing out of a system file picker apart from a real failure.
// Lives here rather than beside the export button so it can be asserted
// directly: importing the component would pull in React Native, which the
// direct-run test files cannot load.
//
// Both platforms raise a dedicated native exception on cancel --
// FilePickingCancelledException on iOS, PickerCancelledException on Android --
// but neither one's error code survives the crossing into JavaScript. What
// arrives is a plain Error carrying only `message` and `stack`, confirmed on
// device 2026-08-04 by logging the caught value. The message is the only
// signal available:
//   iOS      "File picking was cancelled by the user"
//   Android  "The file picker was cancelled by the user"
//
// This is a heuristic on someone else's string, and it is worth being blunt
// about that. It breaks in one direction only: if Expo rewords or localizes
// the message, cancels go back to logging as errors, which is noise and
// nothing worse. For it to wrongly swallow a genuine failure, that failure
// would have to describe itself as cancelled by the user. See D16.
//
// The pattern is deliberately not just /cancel/. A write failing partway
// through a canceled operation could easily say "cancel" without the user
// having chosen anything, and swallowing that is the one outcome worth
// avoiding here.
const PICKER_CANCELLED_MESSAGE = /was cancelled by the user/i;

export function isPickerCancelled(cause: unknown): boolean {
  return cause instanceof Error && PICKER_CANCELLED_MESSAGE.test(cause.message);
}
