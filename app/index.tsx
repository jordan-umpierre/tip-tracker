// Route files stay as thin as possible. The existing screen remains untouched
// while Router takes over the entrypoint, so this migration cannot change Log
// behavior and navigation behavior in the same commit.
export { default } from '../src/App';
