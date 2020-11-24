const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const AWS = require('aws-sdk');
const archiver = require('archiver');
const winston = require('winston');
const cli = require('commander');

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

const logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({filename: "backup-err.log", level: "error"}),
        new winston.transports.File({filename: "backup.log"})
    ]
})

// daily backup of a fs directory to an existing s3 bucket
// backup time and date must appear in the backup file name
// backup script should run once per day automatically
// purge backups older than 7 days --x
// monitor job status and confirm archive file exists in s3 and email a status message at the end of the script run
// script must log to syslog or a dedicated logfile


// Put folder path into a zip file
const archiveFile = (dir = "sometestfolder") => {
    if(fs.existsSync(dir)){
        logger.info(`Starting archival of: ${dir}`);
        const outputFileStream = fs.createWriteStream(`${dir}.zip`);
        const dirArchive = archiver('zip', {zlib: {level: 9}});
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
        dirArchive.directory(dir);
        dirArchive.pipe(outputFileStream);
        dirArchive.finalize();
        logger.info(`${dir} has successfully been archived in ${dir}.zip`);
    }
    else{
        logger.error(`The directory ${dir} doesn't exist!`);
    }
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
            let fileStream = fs.readFileSync(backupFilePath);
            let fileName = await formatBackupName(path.basename(backupFilePath));
            let uploadParams = {
                Bucket: bucketName,
                Key: fileName,
                Body: fileStream,
                Tagging: `purpose=mparticle&app=takehome`
            };
            
            s3.upload(uploadParams)
            .send((err, data) => {
                if(err){
                    return reject(err);
                }
                logger.info(`${fileName} was successfully uploaded!`)
                let s3Uri = `S3://${data.Bucket}/${data.Key}`;
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

// Get sha256 hash of backup file
const getHash = (backupFilePath) => {
    return new Promise((resolve, reject) => {
        if(fs.existsSync(backupFilePath)){
            let shaHash = crypto.createHash("sha256");
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



(async() => {
    // console.log(await getBackupBucketName());
    try{
        let bucketName = await getBackupBucketName();
        console.log(await uploadFileToS3(bucketName));
        // console.log(await getHash("sometestfolder.zip"))

        // console.log(formatBackupName("sometestfolder.zip"));
    }catch(err){
        console.log(err);
    }
})();