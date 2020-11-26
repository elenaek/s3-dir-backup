#!/usr/bin/env node
const process = require('process');
const path = require('path');

const cli = require('commander');
const { prompt } = require("inquirer");
const schedule = require('node-schedule');

const { 
    getCurrentIamUser,
    confirmBackupUploadedToS3,
    createS3Bucket,
    uploadFileToS3,
    bucketExists
} = require('./lib/aws');
const {
    archiveDir,
    cleanUpPostUpload
} = require('./lib/utils');
const{
    sendSMTPNotification,
    validConfiguration
} = require('./lib/mail');
const { logger } = require('./lib/logging');

const { VERSION, DEFAULT } = require('./lib/constants');

const backupDirectory = async (backupDir, bucketName, notify = false) => {
    try{
        await createS3Bucket(bucketName);
        var backupFilePath = await archiveDir(backupDir);
        let { s3BucketKey, parts } = await uploadFileToS3(bucketName, backupFilePath);
        await confirmBackupUploadedToS3(bucketName, s3BucketKey, backupFilePath, parts);
        if(notify){
            await sendSMTPNotification(
                process.env.SMTP_RECEIVERS, 
                `[${new Date().toISOString()}] MPTH_Backup_Success_Notification`, 
                `${backupDir} has been successfully backed up to the ${bucketName} S3 bucket!`
            );
        }
    }catch(err){
        logger.error(JSON.stringify(err));
        logger.error(`${backupDir} has failed to backup to ${bucketName}`);
        if(notify){
            await sendSMTPNotification(
                process.env.SMTP_RECEIVERS, 
                `[${new Date().toISOString()}] MPTH_Backup_Failure_Notification`, 
                `${backupDir} has failed to back up to the ${bucketName} S3 bucket!\n${JSON.stringify(err)}`
            );
        }
    }finally{
        await cleanUpPostUpload(backupFilePath);
    }
}

const generateSmtpPrompts = () => {
    let prompts = [];
    if(!process.env.SMTP_USER){
        prompts.push({
            type: "input",
            name: "tempSmtpUser",
            message: "SMTP User/Email address: "
        }
    )};
    if(!process.env.SMTP_PW){ 
        prompts.push({
            type: "password",
            name: "tempSmtpPassword",
            message: "SMTP Password: "
        }
    )};
    if(!process.env.SMTP_RECEIVERS){
        prompts.push({
            type: "input",
            name: "tempSmtpReceivers",
            message: "Comma separated list of email notification receivers [email1, email2, email3]: "
        }
    )};
    return prompts;
}

const setTemporarySmtpParameters = async () => {
    let { tempSmtpUser, tempSmtpPassword, tempSmtpReceivers } = await prompt(generateSmtpPrompts());
    process.env.SMTP_USER = process.env.SMTP_USER ? process.env.SMTP_USER : tempSmtpUser;
    process.env.SMTP_PW = process.env.SMTP_PW ? process.env.SMTP_PW : tempSmtpPassword;
    process.env.SMTP_RECEIVERS = process.env.SMTP_RECEIVERS ? process.env.SMTP_RECEIVERS : tempSmtpReceivers;
}

const cleanUpExit = async () => {
    let { srcBackupDir } = cli;
    if(srcBackupDir){
        let backupFilePath = `${srcBackupDir}.zip`;
        await cleanUpPostUpload(backupFilePath);
    }
    process.exit();
}

cli
    .version(VERSION)
    .description("CLI tool that backs up specified src directory to destination bucket everyday at midnight.")
    .option("-s, --src-backup-dir <backupDir>", "Source directory to back up to S3 bucket (required)")
    .option("-d, --dest-s3-bucket-name <s3BucketName>", "Name of target S3 bucket to back up to. Will create if doesn't currently exist (required)")
    .option("-n, --notify", "Send SMTP notification on backup success and failures. Please set SMTP_USER, SMTP_PW, SMTP_RECEIVERS env vars or set the respective flags.")
    .option("-sec, --secure", "Use TLS when connecting to server. If false will try a later upgrade to TLS if the server supports STARTTLS")
    .option("-sh, --smtp-host <smtpHost>", "SMTP host address to use")
    .option("-sp, --smtp-port <smtpPort>", "SMTP port to use")
    .option("-su, --smtp-user <smtpUser>", "SMTP user to use for sending notifications")
    .option("-spw, --smtp-password <smtpPassword>", "SMTP password to use for SMTP user")
    .option("-sr, --smtp-receivers <smtpReceivers>", "Comma separated list of email addresses to send notifcations to")
    .action(async () => {
        let { 
            destS3BucketName, 
            srcBackupDir,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPassword,
            smtpReceivers,
            notify,
            secure
        } = cli;

        if(srcBackupDir && destS3BucketName){
            destS3BucketName = destS3BucketName.toLowerCase();
            srcBackupDir = path.normalize(srcBackupDir);
            process.env.SMTP_SECURE = secure === undefined && !smtpPort && !process.env.SMTP_PORT? DEFAULT.SMTP_SECURE : !!secure;
            process.env.SMTP_HOST = smtpHost? smtpHost : process.env.SMTP_HOST || DEFAULT.SMTP_HOST;
            process.env.SMTP_PORT = smtpPort? smtpPort : process.env.SMTP_PORT || DEFAULT.SMTP_PORT;
            process.env.SMTP_USER = smtpUser? smtpUser : process.env.SMTP_USER || "";
            process.env.SMTP_PW = smtpPassword ? smtpPassword : process.env.SMTP_PW || "";
            process.env.SMTP_RECEIVERS = smtpReceivers ? smtpReceivers : process.env.SMTP_RECEIVERS || "";
            let creationConfirmed = await bucketExists(destS3BucketName);
            if(!creationConfirmed){
                let answers = await prompt([
                    {
                        type: "confirm",
                        name: "creationConfirmed",
                        message: `The S3 bucket (${destS3BucketName}) currently does not exist and will be created using your current user (${await getCurrentIamUser()})`,
                        default: false
                    }
                ]);
                creationConfirmed = answers.creationConfirmed;
            }
            if(creationConfirmed){
                if(notify && (
                    !process.env.SMTP_USER || 
                    !process.env.SMTP_PW ||
                    !process.env.SMTP_RECEIVERS
                )){
                    let { setSmtp } = await prompt([
                        {
                            type: "confirm",
                            name: "setSmtp",
                            message: `${`Unset SMTP values!`.red}\n${`SMTP_HOST:`.yellow} ${`${process.env.SMTP_HOST.green || "UNSET".red}`}\n${`SMTP_PORT: `.yellow}${`${process.env.SMTP_PORT+"".green || "UNSET".red}`.green}\n${`SMTP_SECURE: `.yellow}${`${process.env.SMTP_SECURE}`.green}\n${`SMTP_USER: `.yellow}${`${process.env.SMTP_USER? process.env.SMTP_USER.green : "UNSET".red}`.green}\n${`SMTP_PW: `.yellow}${`${process.env.SMTP_PW? "***".green : "UNSET".red}`}\n${`SMTP_RECEIVERS:`.yellow} ${`${process.env.SMTP_RECEIVERS? process.env.SMTP_RECEIVERS.green : "".red}`}\n ${`Would you like to set temporary values?`}`
                        }
                    ]);
                    if(setSmtp){
                        await setTemporarySmtpParameters();
                    }
                    else{
                        notify = false;
                        console.log("SMTP Notifications disabled.".bold.red)
                    }
                }

                if(notify){
                    if(!await validConfiguration()){
                        console.log("Invalid SMTP configuration!".bold.red);
                        process.exit();
                    }
                    else{ console.log("SMTP successfully authenticated!".bold.green) }
                }

                await backupDirectory(srcBackupDir, destS3BucketName, notify);
                schedule.scheduleJob("0 0 * * *", async () => {
                    logger.info(`Backup schedule has begun and will backup the ${srcBackupDir} directory and its subdirectories to the ${destS3BucketName} bucket daily at midnight.`)
                    await backupDirectory(srcBackupDir, destS3BucketName, notify);
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

process.on("exit", async () => {
    await cleanUpExit();
});

process.on("SIGINT", async () => {
    await cleanUpExit();
});

process.on("SIGTERM", async () => {
    await cleanUpExit();
});

process.on("uncaughtException", async () => {
    await cleanUpExit();
});