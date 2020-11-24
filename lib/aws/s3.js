const path = require('path');
const fs = require('fs');

const AWS = require('aws-sdk');
const { formatBackupName, getHash } = require('../utils')
const { logger } = require('../logging');

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
            .send((err, data) => {
                if(err){
                    return reject(err);
                }
                let s3Uri = `S3://${data.Bucket}/${data.Key}`;
                return resolve({s3Uri, s3BucketName: data.Bucket, s3BucketKey: data.Key});
            })
        }
        else {
            throw { message: "Missing one or more of required parameters: bucketName or backupFilePath" }
        }
    });
}

// Confirm that backup is on s3 bucket
const confirmBackupUploadedToS3 = async (bucketName, bucketKey, backupFilePath) => {
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
            if(
                backupSizeInBytes === res.ContentLength &&
                backupHash === s3Hash
                ) {
                    logger.success(`${path.basename(backupFilePath)} was successfully backed up to the ${bucketName} S3 bucket.`);
                    return true;
                }
            return false;
        }catch(err){
            return false;
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

module.exports = {
    uploadFileToS3,
    confirmBackupUploadedToS3,
    createS3Bucket,
    bucketExists,
}