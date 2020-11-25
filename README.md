# Overview
s3-dir-backup is a shell tool for backing up a source directory to a destination S3 bucket daily at midnight.

## Features
* Uploads large backup files using multipart uploads
* SMTP notifications (currently only gmail supported)
* OS agnostic
* Logging and rotation

## Prerequisites
* Node.js
* AWS credentials with (S3: CreateBucket, PutLifecycleConfiguration, ListBuckets) permissions
* R/W permissions for the directory you want to backup

## Getting Started
1) Install s3-dir-backup using `npm install -g s3-dir-backup`
## Basic Usage
`s3-dir-backup -s <sourceDirectory> -d <destinationBucketName>`
* **sourceDirectory** is the directory you want to back up
* **destinationBucketName** is the name of the S3 bucket you want to back up to.
* If the S3 bucket you specify doesn't exist you will be prompted to confirm if you want s3-dir-backup to create it for you

## SMTP Notifications
`s3-dir-backup -s <sourceDirectory> -d <destinationBucketName> --notify`
* The **--notify** flag enables SMTP notifications (currently only gmail is supported)

## SMTP Parameters
---
#### Using Environment Variables
* Set up your SMTP credentials using environment variables
    #### For Windows
    ```
    setx SMTP_USER notificationuser@gmail.com
    setx SMTP_PW notifcationuser@gmail password
    setx SMTP_RECEIVERS receiver1@email.com,receiver2@someotheremail.com
    ```

    #### For MacOS or Linux
    * Exports will not persist unless you put them in your `~/.bash_profile`, `~/.bashrc` or `/etc/environment`
    * Please make sure you understand the differences between the files referenced above before setting your credentials there
    ```
    export SMTP_USER="notificationuser@gmail.com"
    export SMTP_PW="notifcationuser@gmail password"
    export SMTP_RECEIVERS="receiver1@email.com,receiver2@someotheremail.com"
    ```
#### Set SMTP Parameters Inline (temporary)
`s3-dir-backup -s <sourceDirectory> -d <destinationBucketName> -e <smtpUser> -p <smtpPw> -r <commaSeparatedSmtpReceivers>`
* **-e** sets your SMTP user/email account (gmail only supported currently)
* **-p** sets your SMTP password
* **-r** sets the receivers for notifcations separated by commas
* SMTP parameters set inline do not persist between runs
---

## Logging
* Backup logs can be found in the **~/.s3-dir-backup** directory for macOS and Linux and **%USERPROFILE%/.s3-dir-backup** for Windows
* Starts a new log daily up to 30 logs, rotates if a log manages to reach 10mb

## S3 Bucket Expiration Policy
* Objects 7 days and older are expired
* Multipart uploads that have not completed are terminated in 1 day
