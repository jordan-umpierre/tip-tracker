const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Without this, Metro tries to parse schema.sql as JavaScript when db.ts
// imports it. Adding "sql" to assetExts tells it to treat the file as a
// bundled asset instead, the same way it already treats .png or .ttf files.
config.resolver.assetExts.push('sql');

module.exports = config;
