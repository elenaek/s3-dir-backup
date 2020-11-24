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
const{
    sendSMTPNotification
} = require('./lib/mail');

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
        await sendSMTPNotification(
            process.env.SMTP_RECEIVERS, 
            `[${new Date().toISOString()}]MPTH_Backup_Success_Notification`, 
            `${backupDir} has been successfully backed up to the ${bucketName} S3 bucket!`
        );
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

            if(!process.env.SMTP_USER || !process.env.SMTP_PW){
                let { setSmtp } = await prompt([
                    {
                        type: "confirm",
                        name: "setSmtp",
                        message: `Detected unset email env variables: "SMTP_USER", "SMTP_PW" and/or "SMTP_RECEIVERS". Would you like to set temporary values?`
                    }
                ]);
                if(setSmtp){
                    let { smtpUser, smtpPassword, smtpReceivers } = await prompt([
                        {
                            type: "input",
                            name: "smtpUser",
                            message: "SMTP User/Email address: "
                        },
                        {
                            type: "password",
                            name: "smtpPassword",
                            message: "SMTP Password: "
                        },
                        {
                            type: "input",
                            name: "smtpReceivers",
                            message: "Comma separated list of email notification receivers"
                        }
                    ]);
                    process.env.SMTP_USER = smtpUser;
                    process.env.SMTP_PW = smtpPassword;
                    process.env.SMTP_RECEIVERS = smtpReceivers.split(",").map((receiver) => receiver.replace(/\s/gi,"")) || [];
                    console.log(process.env.SMTP_RECEIVERS)
                }
            }
            
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