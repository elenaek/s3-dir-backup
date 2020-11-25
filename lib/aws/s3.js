const path = require('path');
const fs = require('fs');

const AWS = require('aws-sdk');
const cliProgress = require('cli-progress');
const colors = require('colors');
const { formatBackupName, getHash } = require('../utils')
const { logger } = require('../logging');

const { MEGABYTE_IN_BYTES } = require('../constants')

AWS.config.update({
    retryDelayOptions: {
        base: 500,
        retryCount: 10
    }
});

const s3 = new AWS.S3({
    apiVersion: '2006-03-01'
});

// Upload dir archive file to S3
const uploadFileToS3 = (bucketName, backupFilePath) => {
    return new Promise(async (resolve, reject) => {
        if(bucketName, backupFilePath){
            try{
                let fileStream = fs.createReadStream(backupFilePath);
                let fileName = await formatBackupName(backupFilePath);

                let formatString = `${'Upload Progress:'.yellow} [${'{bar}'.green}] ${'{percentage}%'.yellow} | ${'ETA: {eta}s'.yellow} | ${'{value}MBs/{total}MBs'.yellow}`;
                let progressBar = new cliProgress.SingleBar({
                    format: formatString,
                    stopOnComplete: true,
                    etaBuffer: 60,
                    fps: 60
                });
                let uploadParams = {
                    Bucket: bucketName,
                    Key: fileName,
                    Body: fileStream,
                    Tagging: `purpose=mparticle&app=takehome`
                };
                let uploadOptions = {
                    partSize: 10 * MEGABYTE_IN_BYTES
                }
                let parts = 0;

                progressBar.start(Math.round(fileStream.length/MEGABYTE_IN_BYTES, 0));
                s3.upload(uploadParams, uploadOptions)
                .on("httpUploadProgress", (event) => {
                    progressBar.setTotal(Math.round(event.total/MEGABYTE_IN_BYTES));
                    progressBar.update(Math.round(event.loaded/MEGABYTE_IN_BYTES));
                    parts++;
                })
                .send((err, data) => {
                    if(err){
                        return reject(err);
                    }
                    let s3Uri = `S3://${data.Bucket}/${data.Key}`;
                    return resolve({s3Uri, s3BucketName: data.Bucket, s3BucketKey: data.Key, parts});
                })
            }
            catch(err){
                logger.error(JSON.stringify(err))
                reject(err);
            }
        }
        else {
            reject({ message: "Missing one or more of required parameters: bucketName or backupFilePath" })
        }
    });
}

// Confirm that backup is on s3 bucket
const confirmBackupUploadedToS3 = async (bucketName, bucketKey, backupFilePath, parts) => {
    if(bucketName && bucketKey && fs.existsSync(backupFilePath)){
        let backupSizeInBytes = fs.statSync(backupFilePath).size;
        let backupHash = await getHash(backupFilePath, parts);
        let headParams = {
            Bucket: bucketName,
            Key: bucketKey
        }
        try{
            let res = await s3.headObject(headParams).promise();
            let s3Hash = res.ETag.replace(/"/gi, "");
            if(
                backupSizeInBytes === res.ContentLength &&
                backupHash === s3Hash
                ) {
                    logger.success(`${path.basename(backupFilePath)} was successfully backed up to the ${bucketName} S3 bucket.`);
                    return true;
                }
            throw { message: `${path.basename(backupFilePath)} failed to back up to the ${bucketName} S3 bucket.` }
        }catch(err){
            console.log(err);
            logger.error(JSON.stringify(err));
            throw err;
        }
    }
    else{
        return false;
    }
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
            logger.error(JSON.stringify(err));
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
                            AbortIncompleteMultipartUpload: {
                                DaysAfterInitation: 1
                            },
                            Expiration: {
                                Days: 7
                            },
                            ID: "ExpireObjectsIn7Days",
                            Status: "Enabled"
                        }
                    ]
                }
            };
            await s3.createBucket(s3BucketCreateParams).promise();
            await s3.putBucketLifecycle(s3BucketPutLifecycleParams).promise();
            logger.success(`Successfully create an S3 bucket with the name: ${bucketName}`);
        }
    } catch(err){
        logger.error(`Failed to create the S3 bucket: ${bucketName}`);
        throw err;
    }
}

module.exports = {
    uploadFileToS3,
    confirmBackupUploadedToS3,
    createS3Bucket,
    bucketExists,
}