// Routes only map URLs to screens. Screen composition stays under src/ so a
// navigation change does not move application code with it.
//
// Log is the index route because that is what decides the landing tab -- with
// NativeTabs, trigger order sets the order of the bar and nothing else.
export { default } from '../../src/screens/LogScreen';
