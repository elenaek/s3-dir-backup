#!/usr/bin/env node
const process = require('process');

const cli = require('commander');
const { prompt } = require("inquirer");
const schedule = require('node-schedule');

const { 
    getCurrentIamUser,
    confirmBackupUploadedToS3,
    createS3Bucket,
    uploadFileToS3
} = require('./lib/aws');
const {
    archiveDir,
    cleanUpPostUpload
} = require('./lib/utils');

// daily backup of a fs directory to an existing s3 bucket --x
// backup time and date must appear in the backup file name --x
// backup script should run once per day automatically --x
// purge backups older than 7 days --x
// monitor job status and confirm archive file exists in s3 and email a status message at the end of the script run
// script must log to syslog or a dedicated logfile --x


//main backup function
const backupDirectory = async (backupDir, bucketName) => {
    try{
        await createS3Bucket(bucketName);
        let backupFilePath = await archiveDir(backupDir);
        let { s3BucketKey } = await uploadFileToS3(bucketName);
        await confirmBackupUploadedToS3(bucketName, s3BucketKey, backupFilePath);
        await cleanUpPostUpload(backupFilePath);
    }catch(err){
        console.log(err);
    }
}


cli
    .version("0.0.1")
    .description("CLI tool for mpth assignment. Backs up specified src directory to destination bucket everyday at midnight.")
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