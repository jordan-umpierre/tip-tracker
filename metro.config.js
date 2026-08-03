const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Without this, Metro tries to parse schema and migration SQL as JavaScript
// when db.ts imports them. Adding "sql" to assetExts treats each file as a
// bundled asset instead, the same way it already treats .png or .ttf files.
config.resolver.assetExts.push('sql');

module.exports = config;
