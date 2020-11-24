const path = require('path');
const os = require('os');

const winston = require('winston');
require('winston-daily-rotate-file');


const rotateFileTransport = new winston.transports.DailyRotateFile({
    filename: `${path.join(os.homedir(), "mpth-backup", "backup-%DATE%.json")}`,
    maxSize: "10mb",
    maxFiles: "30d"
});

const logger = winston.createLogger({
    levels: {
        error: 0,
        success: 1,
        info: 2
    },
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        rotateFileTransport
    ]
})

module.exports = {
    logger
}