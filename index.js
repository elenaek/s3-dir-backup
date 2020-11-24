const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const process = require('process');

const cli = require('commander');
const { prompt } = require("inquirer");
const AWS = require('aws-sdk');
const archiver = require('archiver');
const schedule = require('node-schedule');
const winston = require('winston');
const inquirer = require('inquirer');
const { query } = require('winston');
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
const iam = new AWS.IAM({
    apiVersion: '2010-05-08'
});

inquirer.registerPrompt('directory', require('inquirer-select-directory'));

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
// backup time and date must appear in the backup file name --x
// backup script should run once per day automatically
// purge backups older than 7 days --x
// monitor job status and confirm archive file exists in s3 and email a status message at the end of the script run
// script must log to syslog or a dedicated logfile --?


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

// check if bucket exists
const bucketExists = async (bucketName) => {
    try{
        if(bucketName){
            let s3HeadParams = {
                Bucket: bucketName
            };
            await s3.headBucket(s3HeadParams).promise();
            return true;
        }
    } catch(err){
        if(err.statusCode === 404){
            return false;
        }
        else{
            throw err;
        }
    }
}

// Create S3 Bucket if doesn't exist
const createS3Bucket = async (bucketName) => {
    try{
        if(bucketName && !await bucketExists(bucketName)){
            let s3BucketCreateParams = {
                Bucket: bucketName,
                ACL: "private"
            };
            let s3BucketPutLifecycleParams = {
                Bucket: bucketName,
                LifecycleConfiguration: {
                    Rules:[
                        {
                            Prefix: "",
                            Expiration: {
                                Days: 7
                            },
                            ID: "ExpireObjectsIn7Days",
                            Status: "Enabled"
                        }
                    ]
                }
            };
            console.log(s3BucketCreateParams);
            await s3.createBucket(s3BucketCreateParams).promise();
            await s3.putBucketLifecycle(s3BucketPutLifecycleParams).promise();
        }
    } catch(err){
        throw err;
    }
}

// Get current IAM user
const getCurrentIamUser = async () => {
    try{
        return await (await iam.getUser().promise()).User.UserName;
    }catch(err){
        throw err;
    }
}

//main backup function
const backupDirectory = async (backupDir, bucketName) => {
    try{
        await createS3Bucket(bucketName);
        let backupFilePath = await archiveDir(backupDir);
        let { s3BucketKey } = await uploadFileToS3(bucketName);
        await confirmBackupUploaded(bucketName, s3BucketKey, backupFilePath);
        await cleanUpPostUpload(backupFilePath);
    }catch(err){
        console.log(err);
    }
}


cli
    .version("0.0.1")
    .description("CLI tool for mpth assignment. Backs up specified src directory to destination bucket")
    .option("-s, --src-backup-dir <backupDir>", "Source directory to back up to S3 bucket (required)")
    .option("-d, --dest-s3-bucket-name <s3BucketName>", "Name of target S3 bucket to back up to. Will create if doesn't currently exist (required)")
    .action(async () => {
        let { destS3BucketName, srcBackupDir } = cli;
        if(srcBackupDir && destS3BucketName){
            destS3BucketName = destS3BucketName.toLowerCase();

            let { confirmed } = await prompt([
                {
                    type: "confirm",
                    name: "confirmed",
                    message: `If the S3 bucket (${destS3BucketName}) doesn't exist it will be created using your current user (${await getCurrentIamUser()})`,
                    default: false
                }
            ]);
            
            if(confirmed){
                await backupDirectory(srcBackupDir, destS3BucketName);
                schedule.scheduleJob("0 0 * * *", async () => {
                    await backupDirectory(srcBackupDir, destS3BucketName);
                });
            }
        }
        else{
            console.log("Please specify a value for both --dest-s3-bucket-name and --src-backup-dir!")
        }
    })
    .parse(process.argv);
    
cli.on('command:*', () => {
        cli.outputHelp();
        return
    });

if(!process.argv.slice(2).length){
    cli.outputHelp();
    return
}