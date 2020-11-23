provider "aws" {
    profile = "default"
    region = var.targetRegion
}

resource "aws_s3_bucket" "dirBackupBucket" {
    bucket = var.backupBucketName
    tags = var.stackTags
    acl = "private"
}

resource "aws_ssm_parameter" "dirBackupBucketNameSsmParam" {
    name = var.bucketNameSsmParamPath
    type = "String"
    value = var.backupBucketName
    tags = var.stackTags
}
output "dirBackupSsmParamPath" {
    value = aws_ssm_parameter.dirBackupBucketNameSsmParam.name
}