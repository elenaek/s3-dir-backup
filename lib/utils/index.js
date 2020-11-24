const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const archiver = require('archiver');

const { logger } = require('../logging');

// Put folder path into a zip file
const archiveDir = (dirToBackup = "sometestfolder") => {
    return new Promise((resolve, reject) => {
        if(fs.existsSync(dirToBackup)){
            logger.info(`Starting archival of: ${dirToBackup}`);
            let archiveFilePath =  `${dirToBackup}.zip`;
            let outputFileStream = fs.createWriteStream(archiveFilePath);
            let dirArchive = archiver('zip', {zlib: {level: 9}});
            outputFileStream.on("close", () => resolve(archiveFilePath))
            dirArchive.on("warning", (warning) => {
                if(warning.code === "ENOENT") logger.warn(warning);
                else {
                    logger.error(err);
                    throw err;
                }
            });
            dirArchive.on("error", (err) => {
                logger.error(err);
                throw err;
            });
            dirArchive.directory(dirToBackup);
            dirArchive.pipe(outputFileStream);
            dirArchive.finalize();
            logger.success(`${dirToBackup} has successfully been archived in ${dirToBackup}.zip`);
        }
        else{
            logger.error(`The directory ${dirToBackup} doesn't exist!`);
            reject();
        }
    });
}

// Format backup name with time and date
const formatBackupName = async (backupFilePath) => {
    if(fs.existsSync(backupFilePath)){
        let fileName = path.basename(backupFilePath, ".zip");
        return `${fileName}/${await getHash(backupFilePath)}-${new Date().toISOString()}.zip`
    }
    else{
        throw { message: `${backupFilePath} doesn't exist!`}
    }
}

// Get md5 hash of backup file
const getHash = (backupFilePath) => {
    return new Promise((resolve, reject) => {
        if(fs.existsSync(backupFilePath)){
            let shaHash = crypto.createHash("md5");
            let fileStream = fs.createReadStream(backupFilePath);
            fileStream.on("error", (err) => reject(err));
            fileStream.on("data", (chunk) => shaHash.update(chunk));
            fileStream.on("end", () => resolve(shaHash.digest("hex").toString()));
        }
        else{
            reject({ message: `${backupFilePath} doesn't exist!`})
        }
    })
}

// Clean up files
const cleanUpPostUpload = async (backupFilePath) => {
    if(fs.existsSync(backupFilePath)) fs.unlinkSync(backupFilePath);
}

module.exports = {
    archiveDir,
    formatBackupName,
    getHash,
    cleanUpPostUpload
}