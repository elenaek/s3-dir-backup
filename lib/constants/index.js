const { version } = require('../../package.json');

module.exports = {
    ...require("./defaults"),
    VERSION: version,
    MEGABYTE_IN_BYTES: 1048576
}