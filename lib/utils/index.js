const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const archiver = require('archiver');

const { logger } = require('../logging');

const { MEGABYTE_IN_BYTES } = require('../constants');

// Put folder path into a zip file
const archiveDir = (dirToBackup) => {
    return new Promise((resolve, reject) => {
        if(fs.existsSync(dirToBackup)){
            logger.info(`Starting archival of: ${dirToBackup}`);
            let archiveFilePath =  `${dirToBackup}.zip`;
            let outputFileStream = fs.createWriteStream(archiveFilePath);
            let dirArchive = archiver('zip', {zlib: {level: 9}});
            outputFileStream.on("close", () => {
                logger.success(`${dirToBackup} has successfully been archived in ${dirToBackup}.zip`);
                resolve(archiveFilePath);
            })
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
            logger.info(`Begun archiving ${dirToBackup} to ${dirToBackup}.zip`);
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
const getHash = (backupFilePath, parts = 1) => {
    return new Promise(async (resolve, reject) => {
        if(fs.existsSync(backupFilePath) && parts === 1){
            let md5Hash = crypto.createHash("md5");
            let fileStream = fs.createReadStream(backupFilePath);
            fileStream.on("error", (err) => reject(err));
            fileStream.on("data", (chunk) => md5Hash.update(chunk));
            fileStream.on("end", () => resolve(md5Hash.digest("hex").toString()));
        }
        else if(fs.existsSync(backupFilePath) && parts > 1){
            try{
                let aggregateHash = [];
                let fiveMegabytes = 10 * MEGABYTE_IN_BYTES;

                let chunk = Buffer.alloc(fiveMegabytes, "base64");

                let fd = fs.openSync(backupFilePath, "r");
                let finishedReading = false;
                while(!finishedReading){
                    let bytesRead = fs.readSync(fd, chunk, 0, fiveMegabytes);
                    if(bytesRead === 0){
                        fs.closeSync(fd);
                        finishedReading = true;
                        break;
                    }
                    aggregateHash.push(crypto.createHash("md5").update(bytesRead < fiveMegabytes? chunk.slice(0, bytesRead) : chunk).digest());
                }
                resolve(`${crypto.createHash("md5").update(Buffer.concat([...aggregateHash])).digest("hex").toString()}-${parts}`)
            }catch(err){
                console.log(err);
            }
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