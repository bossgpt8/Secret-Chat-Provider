// Minimal stub: shell-quote is only used by react-devtools-core (dev tooling).
// Not needed for Expo/Metro builds or production.
exports.quote = function(xs) { return xs.join(' '); };
exports.parse = function(s) { return s.trim().split(/\s+/); };
