const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const cli = require('commander');
const AWS = require('aws-sdk');
const archiver = require('archiver');
const winston = require('winston');
require('winston-daily-rotate-file');

AWS.config.update({
    region: "us-east-1",
    retryDelayOptions: {
        base: 500,
        retryCount: 10
    }
});

const ssm = new AWS.SSM({apiVersion: '2014-11-06'});
const s3 = new AWS.S3({
    apiVersion: '2006-03-01'
});

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

// daily backup of a fs directory to an existing s3 bucket
// backup time and date must appear in the backup file name
// backup script should run once per day automatically
// purge backups older than 7 days --x
// monitor job status and confirm archive file exists in s3 and email a status message at the end of the script run
// script must log to syslog or a dedicated logfile


// Put folder path into a zip file
const archiveDir = (dirToBackup = "sometestfolder") => {
    return new Promise((resolve, reject) => {
        if(fs.existsSync(dirToBackup)){
            logger.info(`Starting archival of: ${dirToBackup}`);
            let archiveFilePath =  `${dirToBackup}.zip`;
            let outputFileStream = fs.createWriteStream(archiveFilePath);
            let dirArchive = archiver('zip', {zlib: {level: 9}});
            outputFileStream.on("close", () => resolve())
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

//Get SSM parameter value with S3 bucket name
const getBackupBucketName = async (ssmPath="/mpart/backup_bucket_name") => {
    try{
        let params = {
            Name: ssmPath
        };
    
        let data = await ssm.getParameter(params).promise();
        return data.Parameter.Value
    } catch(err){
        throw err;
    }
}

// Upload dir archive file to S3
const uploadFileToS3 = (bucketName, backupFilePath = "sometestfolder.zip") => {
    return new Promise(async (resolve, reject) => {
        if(bucketName, backupFilePath){
            let fileStream = fs.createReadStream(backupFilePath);
            let fileName = await formatBackupName(path.basename(backupFilePath));
            let uploadParams = {
                Bucket: bucketName,
                Key: fileName,
                Body: fileStream,
                Tagging: `purpose=mparticle&app=takehome`
            };
            
            s3.upload(uploadParams)
            .on("httpUploadProgress", (event) => console.log(event))
            .send((err, data) => {
                if(err){
                    return reject(err);
                }
                logger.info(`${fileName} was successfully uploaded!`)
                let s3Uri = `S3://${data.Bucket}/${data.Key}`;
                console.log(data);
                return resolve({s3Uri, s3BucketName: data.Bucket, s3BucketKey: data.Key});
            })
        }
        else {
            throw { message: "Missing one or more of required parameters: bucketName or backupFilePath" }
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

// Confirm that backup is on s3 bucket
const confirmBackupUploaded = async (bucketName, bucketKey, backupFilePath) => {
    if(bucketName && bucketKey && fs.existsSync(backupFilePath)){
        let backupSizeInBytes = fs.statSync(backupFilePath).size;
        let backupHash = await getHash(backupFilePath);
        let headParams = {
            Bucket: bucketName,
            Key: bucketKey
        }
        try{
            let res = await s3.headObject(headParams).promise();
            let s3Hash = res.ETag.replace(/"/gi, "");
            console.log(`${backupSizeInBytes} : ${res.ContentLength}`);
            console.log(`${backupHash} : ${s3Hash}`);
            if(
                backupSizeInBytes === res.ContentLength &&
                backupHash === s3Hash
                ) return true;
            return false;
        }catch(err){
            return false;
        }
    }
    else{
        return false;
    }
}

// Clean up files
const cleanUpPostUpload = async (backupFilePath) => {
    if(fs.existsSync(backupFilePath)) fs.unlinkSync(backupFilePath);
}


(async() => {
    try{
        let bucketName = await getBackupBucketName();
        await archiveDir("sometestfolder");
        let { s3BucketKey } = await uploadFileToS3(bucketName);

        console.log(await confirmBackupUploaded(bucketName, s3BucketKey, "sometestfolder.zip"));
        await cleanUpPostUpload("sometestfolder.zip");

    }catch(err){
        console.log(err);
    }
})();