const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// SQL files are bundled schema assets, and expo-sqlite's alpha web build loads
// its database engine from WebAssembly. Metro must copy both instead of trying
// to parse either one as JavaScript.
config.resolver.assetExts.push('sql', 'wasm');

module.exports = config;
