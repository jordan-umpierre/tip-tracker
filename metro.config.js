const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// schema.sql and the migration files ship as bundled assets, so Metro has to
// copy them instead of trying to parse them as JavaScript.
//
// 'wasm' used to be here too, for the WebAssembly database engine expo-sqlite's
// web build loads. Web was dropped in D27, so nothing asks for a .wasm file any
// more and listing it only implied a target this app no longer has.
config.resolver.assetExts.push('sql');

module.exports = config;
