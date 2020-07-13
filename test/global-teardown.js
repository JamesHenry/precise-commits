const rimraf = require("rimraf");

/**
 * Destroy the tmp directory that was created in global-setup.js
 */
module.exports = () => rimraf.sync("tmp");
