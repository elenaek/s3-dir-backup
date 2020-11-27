const { version } = require('../../package.json');

module.exports = {
    ...require("./defaults"),
    ...require("./regex"),
    VERSION: version,
    MEGABYTE_IN_BYTES: 1048576
}